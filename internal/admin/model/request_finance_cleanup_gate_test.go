package model

import (
	"testing"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestCanDropLegacyFinanceColumnsFailsClosedWithoutNormalizedTables(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:finance-cleanup-gate?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	allowed, _, err := CanDropLegacyFinanceColumns(db, 1, 2)
	if err != nil {
		t.Fatalf("gate error: %v", err)
	}
	if allowed {
		t.Fatal("cleanup gate must fail closed without normalized tables")
	}
}
