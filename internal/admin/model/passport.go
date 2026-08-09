package model

import (
	"strings"
)

const (
	PassportLoginSessionStatusPending  = "pending"
	PassportLoginSessionStatusApproved = "approved"
	PassportLoginSessionStatusComplete = "complete"
	PassportLoginSessionStatusFailed   = "failed"
)

// PassportIdentityBinding links a YeYing Passport subject to one local user.
// Wallet matching is used only once for backwards-compatible binding creation.
type PassportIdentityBinding struct {
	SubjectID     string `gorm:"type:varchar(128);primaryKey"`
	UserID        string `gorm:"type:char(36);not null;uniqueIndex"`
	WalletAddress string `gorm:"type:varchar(128);not null;default:'';index"`
	CreatedAt     int64  `gorm:"bigint;index"`
	UpdatedAt     int64  `gorm:"bigint;index"`
}

func (PassportIdentityBinding) TableName() string { return "passport_identity_bindings" }

// PassportLoginSession contains server-side PKCE material for a short-lived
// login attempt. The verifier must never be sent to the browser.
type PassportLoginSession struct {
	SessionID    string `gorm:"type:char(64);primaryKey"`
	State        string `gorm:"type:char(64);not null;uniqueIndex"`
	RequestID    string `gorm:"type:varchar(128);not null;uniqueIndex"`
	CodeVerifier string `gorm:"type:varchar(128);not null"`
	Status       string `gorm:"type:varchar(32);not null;index"`
	Code         string `gorm:"type:varchar(256);not null;default:''"`
	UserID       string `gorm:"type:char(36);not null;default:'';index"`
	ErrorMessage string `gorm:"type:varchar(255);not null;default:''"`
	ExpiresAt    int64  `gorm:"bigint;not null;index"`
	CreatedAt    int64  `gorm:"bigint;index"`
	UpdatedAt    int64  `gorm:"bigint;index"`
}

func (PassportLoginSession) TableName() string { return "passport_login_sessions" }

func FindPassportLoginSessionByID(sessionID string) (*PassportLoginSession, error) {
	row := &PassportLoginSession{}
	if err := DB.Where("session_id = ?", strings.TrimSpace(sessionID)).First(row).Error; err != nil {
		return nil, err
	}
	return row, nil
}

func FindPassportLoginSessionByState(state string) (*PassportLoginSession, error) {
	row := &PassportLoginSession{}
	if err := DB.Where("state = ?", strings.TrimSpace(state)).First(row).Error; err != nil {
		return nil, err
	}
	return row, nil
}

func FindPassportIdentityBinding(subjectID string) (*PassportIdentityBinding, error) {
	row := &PassportIdentityBinding{}
	if err := DB.Where("subject_id = ?", strings.TrimSpace(subjectID)).First(row).Error; err != nil {
		return nil, err
	}
	return row, nil
}

func UpsertPassportIdentityBinding(binding *PassportIdentityBinding) error {
	return DB.Where("subject_id = ?", binding.SubjectID).Assign(binding).FirstOrCreate(&PassportIdentityBinding{}).Error
}
