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

func TestDropLegacyFinanceColumnsRequiresConsistency(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:finance-cleanup-drop?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := db.AutoMigrate(&Log{}, &BillingSettlement{}, &ProcurementAttribution{}); err != nil {
		t.Fatalf("migrate records: %v", err)
	}
	log := &Log{Id: "cleanup-log", Type: LogTypeConsume, CreatedAt: 100, BillingChargeAmount: 42, PromptTokens: 3, CompletionTokens: 4}
	if err := db.Create(log).Error; err != nil {
		t.Fatalf("create log: %v", err)
	}
	if err := db.Create(&BillingSettlement{RequestLogID: log.Id, ChargeAmount: 42, PromptTokens: 3, CompletionTokens: 4}).Error; err != nil {
		t.Fatalf("create settlement: %v", err)
	}
	if err := db.Create(&ProcurementAttribution{RequestLogID: log.Id, Status: ProcurementCostAttributionStatusNone}).Error; err != nil {
		t.Fatalf("create attribution: %v", err)
	}
	if err := DropLegacyFinanceColumnsWithDB(db, 1, 200); err != nil {
		t.Fatalf("drop legacy columns: %v", err)
	}
	if db.Migrator().HasColumn(&Log{}, "billing_charge_amount") {
		t.Fatal("billing_charge_amount should be removed")
	}
	if db.Migrator().HasColumn(&Log{}, "billing_procurement_cost_status") {
		t.Fatal("billing_procurement_cost_status should be removed")
	}
}

func TestDropLegacyFinanceColumnsFailsOnMismatch(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:finance-cleanup-mismatch?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := db.AutoMigrate(&Log{}, &BillingSettlement{}, &ProcurementAttribution{}); err != nil {
		t.Fatalf("migrate records: %v", err)
	}
	log := &Log{Id: "mismatch-log", Type: LogTypeConsume, CreatedAt: 100, BillingChargeAmount: 42}
	if err := db.Create(log).Error; err != nil {
		t.Fatalf("create log: %v", err)
	}
	if err := db.Create(&BillingSettlement{RequestLogID: log.Id, ChargeAmount: 41}).Error; err != nil {
		t.Fatalf("create settlement: %v", err)
	}
	if err := db.Create(&ProcurementAttribution{RequestLogID: log.Id, Status: ProcurementCostAttributionStatusNone}).Error; err != nil {
		t.Fatalf("create attribution: %v", err)
	}
	if err := DropLegacyFinanceColumnsWithDB(db, 1, 200); err == nil {
		t.Fatal("expected consistency gate error")
	}
	if !db.Migrator().HasColumn(&Log{}, "billing_charge_amount") {
		t.Fatal("legacy column must remain after failed cleanup")
	}
}
