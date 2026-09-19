package model

import (
	"testing"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestSyncIdentityEmailWithDB(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	if err := db.AutoMigrate(&User{}); err != nil {
		t.Fatalf("migrate user: %v", err)
	}
	user := User{Id: "user-1", Username: "test", Email: ""}
	if err := db.Create(&user).Error; err != nil {
		t.Fatalf("create user: %v", err)
	}

	if err := SyncIdentityEmailWithDB(db, "user-1", " Person@Example.COM "); err != nil {
		t.Fatalf("sync email: %v", err)
	}
	stored := User{}
	if err := db.First(&stored, "id = ?", "user-1").Error; err != nil {
		t.Fatalf("load user: %v", err)
	}
	if stored.Email != "person@example.com" {
		t.Fatalf("unexpected email: %s", stored.Email)
	}
}

func TestSyncIdentityUsernameWithDBUpdatesGeneratedWalletUsername(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	if err := db.AutoMigrate(&User{}); err != nil {
		t.Fatalf("migrate user: %v", err)
	}
	user := User{Id: "user-1", Username: "wallet_AbC123", DisplayName: "wallet_AbC123"}
	if err := db.Create(&user).Error; err != nil {
		t.Fatalf("create user: %v", err)
	}

	if err := SyncIdentityUsernameWithDB(db, "user-1", "Alice"); err != nil {
		t.Fatalf("sync username: %v", err)
	}
	stored := User{}
	if err := db.First(&stored, "id = ?", "user-1").Error; err != nil {
		t.Fatalf("load user: %v", err)
	}
	if stored.Username != "alice" {
		t.Fatalf("unexpected username: %s", stored.Username)
	}
	if stored.DisplayName != "alice" {
		t.Fatalf("unexpected display name: %s", stored.DisplayName)
	}
}

func TestSyncIdentityUsernameWithDBKeepsUserManagedUsername(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	if err := db.AutoMigrate(&User{}); err != nil {
		t.Fatalf("migrate user: %v", err)
	}
	user := User{Id: "user-1", Username: "person", DisplayName: "Person"}
	if err := db.Create(&user).Error; err != nil {
		t.Fatalf("create user: %v", err)
	}

	if err := SyncIdentityUsernameWithDB(db, "user-1", "alice"); err != nil {
		t.Fatalf("sync username: %v", err)
	}
	stored := User{}
	if err := db.First(&stored, "id = ?", "user-1").Error; err != nil {
		t.Fatalf("load user: %v", err)
	}
	if stored.Username != "person" {
		t.Fatalf("unexpected username: %s", stored.Username)
	}
	if stored.DisplayName != "Person" {
		t.Fatalf("unexpected display name: %s", stored.DisplayName)
	}
}

func TestSyncIdentityUsernameWithDBSkipsTakenUsername(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	if err := db.AutoMigrate(&User{}); err != nil {
		t.Fatalf("migrate user: %v", err)
	}
	users := []User{
		{Id: "user-1", Username: "wallet_AbC123", DisplayName: "wallet_AbC123", AffCode: "aff-1", AccessToken: "token-1"},
		{Id: "user-2", Username: "alice", DisplayName: "alice", AffCode: "aff-2", AccessToken: "token-2"},
	}
	if err := db.Create(&users).Error; err != nil {
		t.Fatalf("create users: %v", err)
	}

	if err := SyncIdentityUsernameWithDB(db, "user-1", "alice"); err != nil {
		t.Fatalf("sync username: %v", err)
	}
	stored := User{}
	if err := db.First(&stored, "id = ?", "user-1").Error; err != nil {
		t.Fatalf("load user: %v", err)
	}
	if stored.Username != "wallet_AbC123" {
		t.Fatalf("unexpected username: %s", stored.Username)
	}
	if stored.DisplayName != "wallet_AbC123" {
		t.Fatalf("unexpected display name: %s", stored.DisplayName)
	}
}
