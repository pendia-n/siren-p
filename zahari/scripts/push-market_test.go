package main

import (
	"testing"
	"time"
)

func TestSourceTimestampInterpretsMySQLWallClock(t *testing.T) {
	location, err := time.LoadLocation("Asia/Hong_Kong")
	if err != nil {
		t.Fatal(err)
	}
	// The driver may parse a timezone-less DATETIME in UTC; its calendar
	// components still represent the collector's Hong Kong wall clock.
	stamp := time.Date(2026, time.October, 6, 10, 15, 20, 0, time.UTC)
	got := sourceTimestamp(stamp, location)
	if got != "2026-10-06T02:15:20Z" {
		t.Fatalf("sourceTimestamp = %q", got)
	}
}
