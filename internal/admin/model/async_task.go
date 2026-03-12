package model

import (
	"fmt"
	"strings"

	"github.com/yeying-community/router/common/helper"
	"github.com/yeying-community/router/common/random"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const (
	AdminTasksTableName = "admin_tasks"

	AsyncTaskTypeChannelModelTest      = "channel_model_test"
	AsyncTaskTypeChannelRefreshModels  = "channel_refresh_models"
	AsyncTaskTypeChannelRefreshBalance = "channel_refresh_balance"

	AsyncTaskStatusPending   = "pending"
	AsyncTaskStatusRunning   = "running"
	AsyncTaskStatusSucceeded = "succeeded"
	AsyncTaskStatusFailed    = "failed"
	AsyncTaskStatusCanceled  = "canceled"
)

type AsyncTask struct {
	Id           string `json:"id" gorm:"type:char(36);primaryKey"`
	Type         string `json:"type" gorm:"type:varchar(64);index"`
	Status       string `json:"status" gorm:"type:varchar(32);index"`
	DedupeKey    string `json:"dedupe_key" gorm:"type:varchar(255);index"`
	ChannelId    string `json:"channel_id,omitempty" gorm:"type:char(36);index"`
	ChannelName  string `json:"channel_name,omitempty" gorm:"-"`
	Model        string `json:"model,omitempty" gorm:"type:varchar(255);index"`
	Endpoint     string `json:"endpoint,omitempty" gorm:"type:varchar(255);default:''"`
	Payload      string `json:"payload,omitempty" gorm:"type:text"`
	Result       string `json:"result,omitempty" gorm:"type:text"`
	ErrorMessage string `json:"error_message,omitempty" gorm:"type:text"`
	CreatedBy    string `json:"created_by,omitempty" gorm:"type:char(36);index"`
	TraceID      string `json:"trace_id,omitempty" gorm:"type:varchar(64);default:'';index"`
	Attempt      int    `json:"attempt" gorm:"default:1"`
	CreatedAt    int64  `json:"created_at" gorm:"bigint;index"`
	StartedAt    int64  `json:"started_at,omitempty" gorm:"bigint"`
	FinishedAt   int64  `json:"finished_at,omitempty" gorm:"bigint"`
}

type AsyncTaskFilter struct {
	Type      string
	Statuses  []string
	ChannelId string
	Model     string
}

func (AsyncTask) TableName() string {
	return AdminTasksTableName
}

func NormalizeAsyncTaskType(value string) string {
	switch strings.TrimSpace(strings.ToLower(value)) {
	case AsyncTaskTypeChannelModelTest:
		return AsyncTaskTypeChannelModelTest
	case AsyncTaskTypeChannelRefreshModels:
		return AsyncTaskTypeChannelRefreshModels
	case AsyncTaskTypeChannelRefreshBalance:
		return AsyncTaskTypeChannelRefreshBalance
	default:
		return ""
	}
}

func NormalizeAsyncTaskStatus(value string) string {
	switch strings.TrimSpace(strings.ToLower(value)) {
	case AsyncTaskStatusPending:
		return AsyncTaskStatusPending
	case AsyncTaskStatusRunning:
		return AsyncTaskStatusRunning
	case AsyncTaskStatusSucceeded:
		return AsyncTaskStatusSucceeded
	case AsyncTaskStatusFailed:
		return AsyncTaskStatusFailed
	case AsyncTaskStatusCanceled:
		return AsyncTaskStatusCanceled
	default:
		return ""
	}
}

func NormalizeAsyncTaskStatuses(values []string) []string {
	result := make([]string, 0, len(values))
	seen := make(map[string]struct{}, len(values))
	for _, value := range values {
		normalized := NormalizeAsyncTaskStatus(value)
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

func IsAsyncTaskTerminalStatus(value string) bool {
	switch NormalizeAsyncTaskStatus(value) {
	case AsyncTaskStatusSucceeded, AsyncTaskStatusFailed, AsyncTaskStatusCanceled:
		return true
	default:
		return false
	}
}

func normalizeAsyncTaskRow(row *AsyncTask) {
	if row == nil {
		return
	}
	row.Id = strings.TrimSpace(row.Id)
	row.Type = NormalizeAsyncTaskType(row.Type)
	row.Status = NormalizeAsyncTaskStatus(row.Status)
	row.DedupeKey = strings.TrimSpace(row.DedupeKey)
	row.ChannelId = strings.TrimSpace(row.ChannelId)
	row.Model = strings.TrimSpace(row.Model)
	row.Endpoint = strings.TrimSpace(row.Endpoint)
	row.Payload = strings.TrimSpace(row.Payload)
	row.Result = strings.TrimSpace(row.Result)
	row.ErrorMessage = strings.TrimSpace(row.ErrorMessage)
	row.CreatedBy = strings.TrimSpace(row.CreatedBy)
	row.TraceID = strings.TrimSpace(row.TraceID)
	if row.Attempt <= 0 {
		row.Attempt = 1
	}
	if row.Status == "" {
		row.Status = AsyncTaskStatusPending
	}
}

func prepareAsyncTaskForCreate(task *AsyncTask) error {
	if task == nil {
		return gorm.ErrInvalidData
	}
	normalizeAsyncTaskRow(task)
	if task.Type == "" {
		return fmt.Errorf("任务类型不能为空")
	}
	if task.DedupeKey == "" {
		return fmt.Errorf("任务去重键不能为空")
	}
	if task.Id == "" {
		task.Id = random.GetUUID()
	}
	if task.CreatedAt == 0 {
		task.CreatedAt = helper.GetTimestamp()
	}
	task.StartedAt = 0
	task.FinishedAt = 0
	task.Result = ""
	task.ErrorMessage = ""
	task.Status = AsyncTaskStatusPending
	return nil
}

func GetAsyncTaskByIDWithDB(db *gorm.DB, taskID string) (AsyncTask, error) {
	if db == nil {
		return AsyncTask{}, fmt.Errorf("database handle is nil")
	}
	normalizedTaskID := strings.TrimSpace(taskID)
	if normalizedTaskID == "" {
		return AsyncTask{}, gorm.ErrRecordNotFound
	}
	row := AsyncTask{}
	if err := db.Where("id = ?", normalizedTaskID).First(&row).Error; err != nil {
		return AsyncTask{}, err
	}
	normalizeAsyncTaskRow(&row)
	if err := hydrateAsyncTaskChannelNames(db, []*AsyncTask{&row}); err != nil {
		return AsyncTask{}, err
	}
	return row, nil
}

func ListAsyncTasksPageWithDB(db *gorm.DB, filter AsyncTaskFilter, page int, pageSize int) ([]AsyncTask, int64, error) {
	if db == nil {
		return nil, 0, fmt.Errorf("database handle is nil")
	}
	if page < 1 {
		page = 1
	}
	if pageSize <= 0 {
		pageSize = 20
	}
	query := db.Model(&AsyncTask{})
	if taskType := NormalizeAsyncTaskType(filter.Type); taskType != "" {
		query = query.Where("type = ?", taskType)
	}
	if statuses := NormalizeAsyncTaskStatuses(filter.Statuses); len(statuses) > 0 {
		query = query.Where("status IN ?", statuses)
	}
	if channelID := strings.TrimSpace(filter.ChannelId); channelID != "" {
		query = query.Where("channel_id = ?", channelID)
	}
	if modelName := strings.TrimSpace(filter.Model); modelName != "" {
		query = query.Where("model = ?", modelName)
	}
	total := int64(0)
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	rows := make([]AsyncTask, 0, pageSize)
	if err := query.
		Order("created_at desc").
		Limit(pageSize).
		Offset((page - 1) * pageSize).
		Find(&rows).Error; err != nil {
		return nil, 0, err
	}
	for i := range rows {
		normalizeAsyncTaskRow(&rows[i])
	}
	rowPointers := make([]*AsyncTask, 0, len(rows))
	for i := range rows {
		rowPointers = append(rowPointers, &rows[i])
	}
	if err := hydrateAsyncTaskChannelNames(db, rowPointers); err != nil {
		return nil, 0, err
	}
	return rows, total, nil
}

func CreateOrReuseAsyncTaskWithDB(db *gorm.DB, task AsyncTask) (AsyncTask, bool, error) {
	if db == nil {
		return AsyncTask{}, false, fmt.Errorf("database handle is nil")
	}
	if err := prepareAsyncTaskForCreate(&task); err != nil {
		return AsyncTask{}, false, err
	}
	created := task
	reused := false
	err := db.Transaction(func(tx *gorm.DB) error {
		existing := AsyncTask{}
		result := tx.
			Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("dedupe_key = ? AND status IN ?", task.DedupeKey, []string{AsyncTaskStatusPending, AsyncTaskStatusRunning}).
			Order("created_at desc").
			Limit(1).
			Find(&existing)
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected > 0 {
			normalizeAsyncTaskRow(&existing)
			created = existing
			reused = true
			return nil
		}
		return tx.Create(&task).Error
	})
	if err != nil {
		return AsyncTask{}, false, err
	}
	if !reused {
		created = task
	}
	return created, reused, nil
}

func ClaimNextPendingAsyncTaskWithDB(db *gorm.DB) (*AsyncTask, error) {
	if db == nil {
		return nil, fmt.Errorf("database handle is nil")
	}
	var claimed *AsyncTask
	err := db.Transaction(func(tx *gorm.DB) error {
		row := AsyncTask{}
		result := tx.
			Clauses(clause.Locking{Strength: "UPDATE", Options: "SKIP LOCKED"}).
			Where("status = ?", AsyncTaskStatusPending).
			Order("created_at asc").
			Limit(1).
			Find(&row)
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected == 0 {
			return nil
		}
		now := helper.GetTimestamp()
		if err := tx.Model(&AsyncTask{}).
			Where("id = ? AND status = ?", row.Id, AsyncTaskStatusPending).
			Updates(map[string]any{
				"status":     AsyncTaskStatusRunning,
				"started_at": now,
			}).Error; err != nil {
			return err
		}
		row.Status = AsyncTaskStatusRunning
		row.StartedAt = now
		normalizeAsyncTaskRow(&row)
		claimed = &row
		return nil
	})
	if err != nil {
		return nil, err
	}
	return claimed, nil
}

func FinishAsyncTaskWithDB(db *gorm.DB, taskID string, status string, result string, errorMessage string) error {
	if db == nil {
		return fmt.Errorf("database handle is nil")
	}
	normalizedTaskID := strings.TrimSpace(taskID)
	if normalizedTaskID == "" {
		return gorm.ErrRecordNotFound
	}
	normalizedStatus := NormalizeAsyncTaskStatus(status)
	if !IsAsyncTaskTerminalStatus(normalizedStatus) {
		return fmt.Errorf("任务状态不支持结束: %s", status)
	}
	return db.Model(&AsyncTask{}).
		Where("id = ?", normalizedTaskID).
		Updates(map[string]any{
			"status":        normalizedStatus,
			"result":        strings.TrimSpace(result),
			"error_message": strings.TrimSpace(errorMessage),
			"finished_at":   helper.GetTimestamp(),
		}).Error
}

func CancelAsyncTaskWithDB(db *gorm.DB, taskID string) (AsyncTask, error) {
	if db == nil {
		return AsyncTask{}, fmt.Errorf("database handle is nil")
	}
	normalizedTaskID := strings.TrimSpace(taskID)
	if normalizedTaskID == "" {
		return AsyncTask{}, gorm.ErrRecordNotFound
	}
	row := AsyncTask{}
	err := db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("id = ?", normalizedTaskID).First(&row).Error; err != nil {
			return err
		}
		normalizeAsyncTaskRow(&row)
		if row.Status == AsyncTaskStatusPending {
			row.Status = AsyncTaskStatusCanceled
			row.FinishedAt = helper.GetTimestamp()
			row.ErrorMessage = "任务已取消"
			return tx.Model(&AsyncTask{}).
				Where("id = ?", row.Id).
				Updates(map[string]any{
					"status":        row.Status,
					"finished_at":   row.FinishedAt,
					"error_message": row.ErrorMessage,
				}).Error
		}
		if row.Status == AsyncTaskStatusRunning {
			return fmt.Errorf("运行中的任务暂不支持取消")
		}
		return fmt.Errorf("当前任务状态不允许取消")
	})
	if err != nil {
		return AsyncTask{}, err
	}
	return row, nil
}

func RetryAsyncTaskWithDB(db *gorm.DB, taskID string) (AsyncTask, bool, error) {
	if db == nil {
		return AsyncTask{}, false, fmt.Errorf("database handle is nil")
	}
	original, err := GetAsyncTaskByIDWithDB(db, taskID)
	if err != nil {
		return AsyncTask{}, false, err
	}
	if !IsAsyncTaskTerminalStatus(original.Status) {
		return AsyncTask{}, false, fmt.Errorf("当前任务状态不允许重试")
	}
	nextTask := AsyncTask{
		Type:      original.Type,
		DedupeKey: original.DedupeKey,
		ChannelId: original.ChannelId,
		Model:     original.Model,
		Endpoint:  original.Endpoint,
		Payload:   original.Payload,
		CreatedBy: original.CreatedBy,
		TraceID:   original.TraceID,
		Attempt:   original.Attempt + 1,
	}
	return CreateOrReuseAsyncTaskWithDB(db, nextTask)
}

func FailRunningAsyncTasksWithDB(db *gorm.DB, errorMessage string) (int64, error) {
	if db == nil {
		return 0, fmt.Errorf("database handle is nil")
	}
	message := strings.TrimSpace(errorMessage)
	if message == "" {
		message = "任务在服务重启前未完成，已标记失败"
	}
	result := db.Model(&AsyncTask{}).
		Where("status = ?", AsyncTaskStatusRunning).
		Updates(map[string]any{
			"status":        AsyncTaskStatusFailed,
			"error_message": message,
			"finished_at":   helper.GetTimestamp(),
		})
	if result.Error != nil {
		return 0, result.Error
	}
	return result.RowsAffected, nil
}

func hydrateAsyncTaskChannelNames(db *gorm.DB, rows []*AsyncTask) error {
	if db == nil || len(rows) == 0 {
		return nil
	}
	channelIDs := make([]string, 0, len(rows))
	seen := make(map[string]struct{}, len(rows))
	for _, row := range rows {
		if row == nil {
			continue
		}
		channelID := strings.TrimSpace(row.ChannelId)
		if channelID == "" {
			continue
		}
		if _, ok := seen[channelID]; ok {
			continue
		}
		seen[channelID] = struct{}{}
		channelIDs = append(channelIDs, channelID)
	}
	if len(channelIDs) == 0 {
		return nil
	}
	channels := make([]Channel, 0, len(channelIDs))
	if err := db.Select("id", "name").Where("id IN ?", channelIDs).Find(&channels).Error; err != nil {
		return err
	}
	channelNames := make(map[string]string, len(channels))
	for _, channel := range channels {
		channelNames[channel.Id] = channel.DisplayName()
	}
	for _, row := range rows {
		if row == nil {
			continue
		}
		row.ChannelName = channelNames[row.ChannelId]
	}
	return nil
}
