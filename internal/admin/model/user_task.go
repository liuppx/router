package model

import (
	"fmt"
	"strings"

	"github.com/yeying-community/router/common/helper"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const (
	UserTasksTableName = "user_tasks"

	UserTaskTypeVideo = "video"
)

type UserTask struct {
	TaskID      string `json:"task_id" gorm:"primaryKey;type:varchar(255)"`
	Type        string `json:"type" gorm:"type:varchar(64);index"`
	UserID      string `json:"user_id" gorm:"type:char(36);index"`
	UserName    string `json:"user_name,omitempty" gorm:"-"`
	GroupID     string `json:"group_id" gorm:"type:varchar(64);index"`
	ChannelID   string `json:"channel_id" gorm:"type:char(36);index"`
	ChannelName string `json:"channel_name" gorm:"type:varchar(255);default:''"`
	Model       string `json:"model" gorm:"type:varchar(255);index"`
	Provider    string `json:"provider" gorm:"type:varchar(64);default:''"`
	Status      string `json:"status" gorm:"type:varchar(64);default:'';index"`
	RequestID   string `json:"request_id" gorm:"type:varchar(255);default:'';index"`
	ResultURL   string `json:"result_url" gorm:"type:text;default:''"`
	Source      string `json:"source" gorm:"type:varchar(64);default:''"`
	CreatedAt   int64  `json:"created_at" gorm:"bigint;index"`
	UpdatedAt   int64  `json:"updated_at" gorm:"bigint;index"`
}

type UserTaskFilter struct {
	Type        string
	Statuses    []string
	UserID      string
	UserKeyword string
	ChannelID   string
	Model       string
}

func (UserTask) TableName() string {
	return UserTasksTableName
}

func NormalizeUserTaskType(value string) string {
	switch strings.TrimSpace(strings.ToLower(value)) {
	case UserTaskTypeVideo:
		return UserTaskTypeVideo
	default:
		return ""
	}
}

func NormalizeUserTaskStatuses(values []string) []string {
	result := make([]string, 0, len(values))
	seen := make(map[string]struct{}, len(values))
	for _, value := range values {
		normalized := strings.TrimSpace(strings.ToLower(value))
		if normalized == "" {
			continue
		}
		if _, ok := seen[normalized]; ok {
			continue
		}
		seen[normalized] = struct{}{}
		result = append(result, normalized)
	}
	return result
}

func normalizeUserTaskRow(row *UserTask) {
	if row == nil {
		return
	}
	row.TaskID = strings.TrimSpace(row.TaskID)
	row.Type = NormalizeUserTaskType(row.Type)
	row.UserID = strings.TrimSpace(row.UserID)
	row.UserName = strings.TrimSpace(row.UserName)
	row.GroupID = strings.TrimSpace(row.GroupID)
	row.ChannelID = strings.TrimSpace(row.ChannelID)
	row.ChannelName = strings.TrimSpace(row.ChannelName)
	row.Model = strings.TrimSpace(row.Model)
	row.Provider = strings.TrimSpace(strings.ToLower(row.Provider))
	row.Status = strings.TrimSpace(strings.ToLower(row.Status))
	row.RequestID = strings.TrimSpace(row.RequestID)
	row.ResultURL = strings.TrimSpace(row.ResultURL)
	row.Source = strings.TrimSpace(row.Source)
}

func UpsertUserTaskWithDB(db *gorm.DB, row UserTask) error {
	if db == nil {
		return fmt.Errorf("database handle is nil")
	}
	normalizeUserTaskRow(&row)
	if row.TaskID == "" {
		return fmt.Errorf("user task id cannot be empty")
	}
	if row.Type == "" {
		row.Type = UserTaskTypeVideo
	}
	now := helper.GetTimestamp()
	if row.CreatedAt == 0 {
		row.CreatedAt = now
	}
	row.UpdatedAt = now
	return db.Clauses(clause.OnConflict{
		Columns: []clause.Column{{Name: "task_id"}},
		DoUpdates: clause.Assignments(map[string]any{
			"type":         row.Type,
			"user_id":      row.UserID,
			"group_id":     row.GroupID,
			"channel_id":   row.ChannelID,
			"channel_name": row.ChannelName,
			"model":        row.Model,
			"provider":     row.Provider,
			"status":       row.Status,
			"request_id":   row.RequestID,
			"result_url":   row.ResultURL,
			"source":       row.Source,
			"updated_at":   row.UpdatedAt,
		}),
	}).Create(&row).Error
}

func GetUserTaskByTaskIDWithDB(db *gorm.DB, taskID string) (UserTask, error) {
	if db == nil {
		return UserTask{}, fmt.Errorf("database handle is nil")
	}
	normalizedTaskID := strings.TrimSpace(taskID)
	if normalizedTaskID == "" {
		return UserTask{}, gorm.ErrRecordNotFound
	}
	row := UserTask{}
	if err := db.Where("task_id = ?", normalizedTaskID).First(&row).Error; err != nil {
		return UserTask{}, err
	}
	normalizeUserTaskRow(&row)
	if err := hydrateUserTaskRelations(db, []*UserTask{&row}); err != nil {
		return UserTask{}, err
	}
	return row, nil
}

func ListUserTasksPageWithDB(db *gorm.DB, filter UserTaskFilter, page int, pageSize int) ([]UserTask, int64, error) {
	if db == nil {
		return nil, 0, fmt.Errorf("database handle is nil")
	}
	if page < 1 {
		page = 1
	}
	if pageSize <= 0 {
		pageSize = 20
	}
	query := db.Model(&UserTask{})
	if taskType := NormalizeUserTaskType(filter.Type); taskType != "" {
		query = query.Where("type = ?", taskType)
	}
	if statuses := NormalizeUserTaskStatuses(filter.Statuses); len(statuses) > 0 {
		query = query.Where("status IN ?", statuses)
	}
	if userID := strings.TrimSpace(filter.UserID); userID != "" {
		query = query.Where("user_id = ?", userID)
	}
	if userKeyword := strings.TrimSpace(filter.UserKeyword); userKeyword != "" {
		query = query.Joins("LEFT JOIN users ON users.id = user_tasks.user_id").
			Where("users.id = ? OR users.username ILIKE ?", userKeyword, "%"+userKeyword+"%")
	}
	if channelID := strings.TrimSpace(filter.ChannelID); channelID != "" {
		query = query.Where("channel_id = ?", channelID)
	}
	if modelName := strings.TrimSpace(filter.Model); modelName != "" {
		query = query.Where("model = ?", modelName)
	}
	total := int64(0)
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	rows := make([]UserTask, 0, pageSize)
	if err := query.Order("created_at desc").Limit(pageSize).Offset((page - 1) * pageSize).Find(&rows).Error; err != nil {
		return nil, 0, err
	}
	for i := range rows {
		normalizeUserTaskRow(&rows[i])
	}
	rowPointers := make([]*UserTask, 0, len(rows))
	for i := range rows {
		rowPointers = append(rowPointers, &rows[i])
	}
	if err := hydrateUserTaskRelations(db, rowPointers); err != nil {
		return nil, 0, err
	}
	return rows, total, nil
}

func hydrateUserTaskRelations(db *gorm.DB, rows []*UserTask) error {
	if db == nil || len(rows) == 0 {
		return nil
	}
	channelIDs := make([]string, 0, len(rows))
	userIDs := make([]string, 0, len(rows))
	seenChannelIDs := make(map[string]struct{}, len(rows))
	seenUserIDs := make(map[string]struct{}, len(rows))
	for _, row := range rows {
		if row == nil {
			continue
		}
		channelID := strings.TrimSpace(row.ChannelID)
		if channelID != "" {
			if _, ok := seenChannelIDs[channelID]; !ok {
				seenChannelIDs[channelID] = struct{}{}
				channelIDs = append(channelIDs, channelID)
			}
		}
		userID := strings.TrimSpace(row.UserID)
		if userID != "" {
			if _, ok := seenUserIDs[userID]; !ok {
				seenUserIDs[userID] = struct{}{}
				userIDs = append(userIDs, userID)
			}
		}
	}
	channelNames := map[string]string{}
	if len(channelIDs) > 0 {
		channels := make([]Channel, 0, len(channelIDs))
		if err := db.Select("id", "name").Where("id IN ?", channelIDs).Find(&channels).Error; err != nil {
			return err
		}
		for _, channel := range channels {
			channelNames[channel.Id] = channel.DisplayName()
		}
	}
	userNames := map[string]string{}
	if len(userIDs) > 0 {
		users := make([]User, 0, len(userIDs))
		if err := db.Select("id", "username").Where("id IN ?", userIDs).Find(&users).Error; err != nil {
			return err
		}
		for _, user := range users {
			userNames[user.Id] = strings.TrimSpace(user.Username)
		}
	}
	for _, row := range rows {
		if row == nil {
			continue
		}
		if row.ChannelName == "" {
			row.ChannelName = channelNames[row.ChannelID]
		}
		row.UserName = userNames[row.UserID]
	}
	return nil
}
