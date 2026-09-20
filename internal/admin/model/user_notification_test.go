package model

import (
	"testing"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func newUserNotificationTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	if err := db.AutoMigrate(&User{}, &UserBalanceLot{}, &UserNotificationEvent{}, &UserBalanceNotificationState{}); err != nil {
		t.Fatalf("migrate notification tables: %v", err)
	}
	return db
}

func TestCreateUserOrderNotificationEventIsIdempotent(t *testing.T) {
	db := newUserNotificationTestDB(t)
	if err := db.Create(&User{Id: "user-1", Username: "test", Email: "person@example.com"}).Error; err != nil {
		t.Fatalf("create user: %v", err)
	}
	order := TopupOrder{Id: "order-1", UserID: "user-1", BusinessType: TopupOrderBusinessBalance, CreditOrigin: TopupOrderCreditOriginPaid, Status: TopupOrderStatusFulfilled, Quota: 100}
	for range 2 {
		if err := CreateUserOrderNotificationEventWithDB(db, order); err != nil {
			t.Fatalf("create notification event: %v", err)
		}
	}
	var count int64
	if err := db.Model(&UserNotificationEvent{}).Count(&count).Error; err != nil {
		t.Fatalf("count notification events: %v", err)
	}
	if count != 1 {
		t.Fatalf("notification event count = %d, want 1", count)
	}
}

func TestRefreshUserBalanceLowNotificationEventsRequiresRecovery(t *testing.T) {
	db := newUserNotificationTestDB(t)
	if err := db.Create(&User{Id: "user-1", Username: "test", Email: "person@example.com"}).Error; err != nil {
		t.Fatalf("create user: %v", err)
	}
	lot := UserBalanceLot{Id: "lot-1", UserID: "user-1", SourceType: UserBalanceLotSourceTopup, SourceID: "order-1", TotalAmount: 50, RemainingAmount: 50, Status: UserBalanceLotStatusActive}
	if err := db.Create(&lot).Error; err != nil {
		t.Fatalf("create balance lot: %v", err)
	}
	if err := RefreshUserBalanceLowNotificationEventsWithDB(db, 100, 1000); err != nil {
		t.Fatalf("create first balance alert: %v", err)
	}
	if err := RefreshUserBalanceLowNotificationEventsWithDB(db, 100, 1001); err != nil {
		t.Fatalf("repeat low balance scan: %v", err)
	}
	if err := db.Model(&UserBalanceLot{}).Where("id = ?", lot.Id).Update("remaining_amount", 150).Error; err != nil {
		t.Fatalf("restore balance: %v", err)
	}
	if err := RefreshUserBalanceLowNotificationEventsWithDB(db, 100, 1002); err != nil {
		t.Fatalf("scan restored balance: %v", err)
	}
	if err := db.Model(&UserBalanceLot{}).Where("id = ?", lot.Id).Update("remaining_amount", 25).Error; err != nil {
		t.Fatalf("lower balance again: %v", err)
	}
	if err := RefreshUserBalanceLowNotificationEventsWithDB(db, 100, 1003); err != nil {
		t.Fatalf("create second balance alert: %v", err)
	}
	var count int64
	if err := db.Model(&UserNotificationEvent{}).Where("event_type = ?", UserNotificationEventTypeBalanceLow).Count(&count).Error; err != nil {
		t.Fatalf("count balance alerts: %v", err)
	}
	if count != 2 {
		t.Fatalf("balance alert count = %d, want 2", count)
	}
}

// TestRefreshUserBalanceLowNotificationEventsRespectsPerUserThreshold 验证 per-user
// 阈值覆盖全局默认:全局默认 100,user-1 自定义为 200,余额 150 仅按自定义阈值触发。
func TestRefreshUserBalanceLowNotificationEventsRespectsPerUserThreshold(t *testing.T) {
	db := newUserNotificationTestDB(t)
	thresholdHigh := int64(200)
	notifyOn := true
	if err := db.Create(&User{Id: "user-1", Username: "test", Email: "person@example.com", AccessToken: "tok-1", AffCode: "aff-1", LowBalanceThreshold: &thresholdHigh, NotifyOnLowBalance: &notifyOn}).Error; err != nil {
		t.Fatalf("create user: %v", err)
	}
	thresholdDefault := int64(100)
	if err := db.Create(&User{Id: "user-2", Username: "test2", Email: "person2@example.com", AccessToken: "tok-2", AffCode: "aff-2", LowBalanceThreshold: &thresholdDefault, NotifyOnLowBalance: &notifyOn}).Error; err != nil {
		t.Fatalf("create user: %v", err)
	}
	lot1 := UserBalanceLot{Id: "lot-1", UserID: "user-1", SourceType: UserBalanceLotSourceTopup, SourceID: "order-1", TotalAmount: 200, RemainingAmount: 150, Status: UserBalanceLotStatusActive}
	lot2 := UserBalanceLot{Id: "lot-2", UserID: "user-2", SourceType: UserBalanceLotSourceTopup, SourceID: "order-2", TotalAmount: 200, RemainingAmount: 150, Status: UserBalanceLotStatusActive}
	if err := db.Create(&lot1).Error; err != nil {
		t.Fatalf("create lot-1: %v", err)
	}
	if err := db.Create(&lot2).Error; err != nil {
		t.Fatalf("create lot-2: %v", err)
	}
	if err := RefreshUserBalanceLowNotificationEventsWithDB(db, 100, 1000); err != nil {
		t.Fatalf("refresh: %v", err)
	}
	var lowCount int64
	if err := db.Model(&UserNotificationEvent{}).Where("event_type = ? AND user_id = ?", UserNotificationEventTypeBalanceLow, "user-1").Count(&lowCount).Error; err != nil {
		t.Fatalf("count user-1 alerts: %v", err)
	}
	if lowCount != 1 {
		t.Fatalf("user-1 balance alerts = %d, want 1 (150 < 200)", lowCount)
	}
	var user2Count int64
	if err := db.Model(&UserNotificationEvent{}).Where("event_type = ? AND user_id = ?", UserNotificationEventTypeBalanceLow, "user-2").Count(&user2Count).Error; err != nil {
		t.Fatalf("count user-2 alerts: %v", err)
	}
	if user2Count != 0 {
		t.Fatalf("user-2 balance alerts = %d, want 0 (150 >= 100 default threshold)", user2Count)
	}
}

// TestRefreshUserBalanceLowNotificationEventsRespectsNotifySwitch 验证关闭邮件开关后,
// 即使余额低于阈值也不再生成低余额事件。
func TestRefreshUserBalanceLowNotificationEventsRespectsNotifySwitch(t *testing.T) {
	db := newUserNotificationTestDB(t)
	if err := db.Create(&User{Id: "user-1", Username: "test", Email: "person@example.com", AccessToken: "tok-switch-off"}).Error; err != nil {
		t.Fatalf("create user-1: %v", err)
	}
	// GORM 在 nullable 列上会忽略 Create 显式零值,这里直接 Update 列。
	if err := db.Model(&User{}).Where("id = ?", "user-1").Update("notify_on_low_balance", false).Error; err != nil {
		t.Fatalf("disable notify switch: %v", err)
	}
	// 校验列确为关闭态。
	var storedNotify *bool
	if err := db.Model(&User{}).Select("notify_on_low_balance").Where("id = ?", "user-1").Scan(&storedNotify).Error; err != nil {
		t.Fatalf("read notify column: %v", err)
	}
	if storedNotify == nil || *storedNotify {
		t.Fatalf("stored notify_on_low_balance = %v, want false", storedNotify)
	}
	lot := UserBalanceLot{Id: "lot-1", UserID: "user-1", SourceType: UserBalanceLotSourceTopup, SourceID: "order-1", TotalAmount: 50, RemainingAmount: 10, Status: UserBalanceLotStatusActive}
	if err := db.Create(&lot).Error; err != nil {
		t.Fatalf("create lot: %v", err)
	}
	if err := RefreshUserBalanceLowNotificationEventsWithDB(db, 100, 1000); err != nil {
		t.Fatalf("refresh: %v", err)
	}
	var count int64
	if err := db.Model(&UserNotificationEvent{}).Where("event_type = ?", UserNotificationEventTypeBalanceLow).Count(&count).Error; err != nil {
		t.Fatalf("count alerts: %v", err)
	}
	if count != 0 {
		t.Fatalf("balance alerts = %d, want 0 (notify switch off)", count)
	}
}
