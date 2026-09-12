package model

import (
	"testing"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func addEventLogFinanceColumnsForCleanupTest(t *testing.T, db *gorm.DB) {
	t.Helper()
	for _, statement := range []string{
		"ALTER TABLE event_logs ADD COLUMN billing_charge_amount bigint DEFAULT 0",
		"ALTER TABLE event_logs ADD COLUMN billing_procurement_cost_status varchar(32) DEFAULT ''",
	} {
		if err := db.Exec(statement).Error; err != nil {
			t.Fatalf("add removable finance column: %v", err)
		}
	}
}

func TestCanDropFinanceColumnsFailsClosedWithoutNormalizedTables(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:finance-cleanup-gate?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	allowed, _, err := CanDropFinanceColumns(db, 1, 2)
	if err != nil {
		t.Fatalf("gate error: %v", err)
	}
	if allowed {
		t.Fatal("cleanup gate must fail closed without normalized tables")
	}
}

func TestDropFinanceColumnsRequiresConsistency(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:finance-cleanup-drop?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := db.AutoMigrate(&Log{}, &BillingSettlement{}, &ProcurementAttribution{}); err != nil {
		t.Fatalf("migrate records: %v", err)
	}
	addEventLogFinanceColumnsForCleanupTest(t, db)
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
	if err := DropFinanceColumnsWithDB(db, 0, 0); err != nil {
		t.Fatalf("drop legacy columns: %v", err)
	}
	if db.Migrator().HasColumn(EventLogsTableName, "billing_charge_amount") {
		t.Fatal("billing_charge_amount should be removed")
	}
	if db.Migrator().HasColumn(EventLogsTableName, "billing_procurement_cost_status") {
		t.Fatal("billing_procurement_cost_status should be removed")
	}
}

func TestDropFinanceColumnsFailsOnMismatch(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:finance-cleanup-mismatch?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := db.AutoMigrate(&Log{}, &BillingSettlement{}, &ProcurementAttribution{}); err != nil {
		t.Fatalf("migrate records: %v", err)
	}
	addEventLogFinanceColumnsForCleanupTest(t, db)
	log := &Log{Id: "mismatch-log", Type: LogTypeConsume, CreatedAt: 100, PromptTokens: 2}
	if err := db.Create(log).Error; err != nil {
		t.Fatalf("create log: %v", err)
	}
	if err := db.Create(&BillingSettlement{RequestLogID: log.Id, PromptTokens: 1}).Error; err != nil {
		t.Fatalf("create settlement: %v", err)
	}
	if err := db.Create(&ProcurementAttribution{RequestLogID: log.Id, Status: ProcurementCostAttributionStatusNone}).Error; err != nil {
		t.Fatalf("create attribution: %v", err)
	}
	if err := DropFinanceColumnsWithDB(db, 0, 0); err == nil {
		t.Fatal("expected consistency gate error")
	}
	if !db.Migrator().HasColumn(EventLogsTableName, "billing_charge_amount") {
		t.Fatal("finance column must remain after failed cleanup")
	}
}

func TestDropFinanceColumnsRejectsBoundedWindow(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:finance-cleanup-window?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := db.AutoMigrate(&Log{}, &BillingSettlement{}, &ProcurementAttribution{}); err != nil {
		t.Fatalf("migrate records: %v", err)
	}
	addEventLogFinanceColumnsForCleanupTest(t, db)
	if err := DropFinanceColumnsWithDB(db, 1, 2); err == nil {
		t.Fatal("expected bounded cleanup window to be rejected")
	}
	if !db.Migrator().HasColumn(EventLogsTableName, "billing_charge_amount") {
		t.Fatal("finance columns must remain after bounded cleanup rejection")
	}
}

func TestLogMigrationsDropFinanceColumns(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:finance-cleanup-log-migration?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := db.AutoMigrate(&Log{}, &BillingSettlement{}, &ProcurementAttribution{}); err != nil {
		t.Fatalf("migrate records: %v", err)
	}
	addEventLogFinanceColumnsForCleanupTest(t, db)
	row := &Log{Id: "migration-log", Type: LogTypeConsume, CreatedAt: 100, PromptTokens: 3, CompletionTokens: 4}
	if err := CreateLogWithFinanceRecords(db, row); err != nil {
		t.Fatalf("create records: %v", err)
	}

	if err := runLogVersionedMigrations(db); err != nil {
		t.Fatalf("run log migrations: %v", err)
	}
	if db.Migrator().HasColumn(EventLogsTableName, "billing_charge_amount") || db.Migrator().HasColumn(EventLogsTableName, "billing_procurement_cost_status") {
		t.Fatal("log migration did not remove finance columns")
	}
	var applied int64
	if err := db.Model(&SchemaMigration{}).
		Where("scope = ? AND version = ?", migrationScopeLog, "202609121000_drop_event_log_finance_columns").
		Count(&applied).Error; err != nil {
		t.Fatalf("count cleanup migration: %v", err)
	}
	if applied != 1 {
		t.Fatalf("cleanup migration count = %d, want 1", applied)
	}
}

func TestDropObsoleteEventLogFinanceColumnsWithDB(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:obsolete-event-log-finance?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.Exec("CREATE TABLE event_logs (id varchar(36) primary key, billing_gross_profit_cny double, billing_yyc_amount double, billing_yyc_rate double, billing_image_tool_amount double)").Error; err != nil {
		t.Fatal(err)
	}
	if err := DropObsoleteEventLogFinanceColumnsWithDB(db); err != nil {
		t.Fatal(err)
	}
	for _, column := range []string{"billing_gross_profit_cny", "billing_yyc_amount", "billing_yyc_rate"} {
		if db.Migrator().HasColumn(EventLogsTableName, column) {
			t.Fatalf("%s should be removed", column)
		}
	}
	if !db.Migrator().HasColumn(EventLogsTableName, "billing_image_tool_amount") {
		t.Fatal("active image-tool billing column must remain")
	}
}
