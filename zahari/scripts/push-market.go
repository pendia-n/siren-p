// Run from the silvering Go module after the existing collector has written MySQL rows.
// Required environment variables: ZAHARI_MYSQL_DSN, ZAHARI_INGEST_SECRET, ZAHARI_INGEST_URL.
package main

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"time"

	_ "github.com/go-sql-driver/mysql"
)

type marketRow struct {
	Table     string  `json:"table"`
	Asset     string  `json:"asset"`
	Gap       string  `json:"gap"`
	ID        int64   `json:"id"`
	Timestamp string  `json:"timestamp"`
	X         float64 `json:"x"`
	Deviation float64 `json:"deviation"`
	Sigma     float64 `json:"sigma"`
	H         float64 `json:"h"`
	E         float64 `json:"e"`
	Close     float64 `json:"close"`
}

var assets = []string{"AAVE", "BNB", "BTC", "ETH", "LINK", "SOL", "UNI", "XAUT"}

// V1 scene rules use ST/1m only. Do not pay to copy unused LT or other gaps.
var gaps = []string{"1m"}

func send(ctx context.Context, client *http.Client, url, secret string, rows []marketRow) error {
	payload, err := json.Marshal(map[string]any{"rows": rows})
	if err != nil {
		return err
	}
	stamp := strconv.FormatInt(time.Now().Unix(), 10)
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(stamp + "."))
	mac.Write(payload)
	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(payload))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Zahari-Timestamp", stamp)
	req.Header.Set("X-Zahari-Signature", hex.EncodeToString(mac.Sum(nil)))
	res, err := client.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode != 200 {
		io.Copy(io.Discard, res.Body)
		return fmt.Errorf("ingest status %d", res.StatusCode)
	}
	return nil
}
func saveState(path string, state map[string]int64) error {
	encoded, err := json.Marshal(state)
	if err != nil {
		return err
	}
	temporary := path + ".tmp"
	if err = os.WriteFile(temporary, encoded, 0600); err != nil {
		return err
	}
	return os.Rename(temporary, path)
}
func main() {
	dsn, secret, url := os.Getenv("ZAHARI_MYSQL_DSN"), os.Getenv("ZAHARI_INGEST_SECRET"), os.Getenv("ZAHARI_INGEST_URL")
	if dsn == "" || secret == "" || url == "" {
		fmt.Fprintln(os.Stderr, "Set ZAHARI_MYSQL_DSN, ZAHARI_INGEST_SECRET and ZAHARI_INGEST_URL.")
		os.Exit(2)
	}
	configDir, err := os.UserConfigDir()
	if err != nil {
		panic(err)
	}
	directory := filepath.Join(configDir, "zahari")
	if err = os.MkdirAll(directory, 0700); err != nil {
		panic(err)
	}
	path := filepath.Join(directory, "market-sync-state.json")
	state := map[string]int64{}
	if data, err := os.ReadFile(path); err == nil {
		if err = json.Unmarshal(data, &state); err != nil {
			panic(err)
		}
	} else if !os.IsNotExist(err) {
		panic(err)
	}
	db, err := sql.Open("mysql", dsn)
	if err != nil {
		panic(err)
	}
	defer db.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Minute)
	defer cancel()
	if err = db.PingContext(ctx); err != nil {
		panic(err)
	}
	client := &http.Client{Timeout: 25 * time.Second}
	total := 0
	for _, table := range []string{"st"} {
		fields := "id, timestamp, x, deviation, sigma, h, e, close"
		if table == "lt" {
			fields = "id, timestamp, x, deviation, sigmalong, hnob, enob, close"
		}
		for _, asset := range assets {
			for _, gap := range gaps {
				key := table + ":" + asset + ":" + gap
				cursor := state[key]
				query := "SELECT " + fields + " FROM " + table + " WHERE asset=? AND gap=? AND id>? ORDER BY id ASC LIMIT 5000"
				args := []any{asset, gap, cursor}
				if cursor == 0 {
					query = "SELECT " + fields + " FROM (SELECT " + fields + " FROM " + table + " WHERE asset=? AND gap=? ORDER BY id DESC LIMIT 900) recent ORDER BY id ASC"
					args = []any{asset, gap}
				}
				rows, err := db.QueryContext(ctx, query, args...)
				if err != nil {
					panic(err)
				}
				batch := make([]marketRow, 0, 100)
				for rows.Next() {
					var item marketRow
					var stamp time.Time
					if err = rows.Scan(&item.ID, &stamp, &item.X, &item.Deviation, &item.Sigma, &item.H, &item.E, &item.Close); err != nil {
						rows.Close()
						panic(err)
					}
					item.Table, item.Asset, item.Gap, item.Timestamp = table, asset, gap, stamp.UTC().Format(time.RFC3339)
					batch = append(batch, item)
					if len(batch) == 100 {
						if err = send(ctx, client, url, secret, batch); err != nil {
							rows.Close()
							panic(err)
						}
						state[key] = batch[len(batch)-1].ID
						if err = saveState(path, state); err != nil {
							rows.Close()
							panic(err)
						}
						total += len(batch)
						batch = batch[:0]
					}
				}
				if err = rows.Err(); err != nil {
					rows.Close()
					panic(err)
				}
				rows.Close()
				if len(batch) > 0 {
					if err = send(ctx, client, url, secret, batch); err != nil {
						panic(err)
					}
					state[key] = batch[len(batch)-1].ID
					if err = saveState(path, state); err != nil {
						panic(err)
					}
					total += len(batch)
				}
			}
		}
	}
	fmt.Printf("Synced %d rows from MySQL to Zahari.\n", total)
}
