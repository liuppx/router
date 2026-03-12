package task

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/yeying-community/router/common/config"
	"github.com/yeying-community/router/common/ctxkey"
	"github.com/yeying-community/router/internal/admin/model"
)

type taskListData struct {
	Items    []model.AsyncTask `json:"items"`
	Total    int64             `json:"total"`
	Page     int               `json:"page"`
	PageSize int               `json:"page_size"`
}

type userTaskListData struct {
	Items    []model.UserTask `json:"items"`
	Total    int64            `json:"total"`
	Page     int              `json:"page"`
	PageSize int              `json:"page_size"`
}

func parseTaskStatuses(raw string) []string {
	parts := strings.Split(strings.TrimSpace(raw), ",")
	result := make([]string, 0, len(parts))
	for _, item := range parts {
		normalized := strings.TrimSpace(item)
		if normalized == "" {
			continue
		}
		result = append(result, normalized)
	}
	return result
}

func parsePageParams(c *gin.Context) (int, int) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	if page < 1 {
		page = 1
	}
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", strconv.Itoa(config.ItemsPerPage)))
	if pageSize <= 0 {
		pageSize = config.ItemsPerPage
	}
	return page, pageSize
}

// GetTasks godoc
// @Summary List async tasks (admin)
// @Tags admin
// @Security BearerAuth
// @Produce json
// @Router /api/v1/admin/tasks [get]
func GetTasks(c *gin.Context) {
	page, pageSize := parsePageParams(c)
	items, total, err := model.ListAsyncTasksPageWithDB(model.DB, model.AsyncTaskFilter{
		Type:      strings.TrimSpace(c.Query("type")),
		Statuses:  parseTaskStatuses(c.Query("status")),
		ChannelId: strings.TrimSpace(c.Query("channel_id")),
		Model:     strings.TrimSpace(c.Query("model")),
	}, page, pageSize)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data": taskListData{
			Items:    items,
			Total:    total,
			Page:     page,
			PageSize: pageSize,
		},
	})
}

// GetUserTasks godoc
// @Summary List user tasks (admin)
// @Tags admin
// @Security BearerAuth
// @Produce json
// @Router /api/v1/admin/user/tasks [get]
func GetUserTasks(c *gin.Context) {
	page, pageSize := parsePageParams(c)
	items, total, err := model.ListUserTasksPageWithDB(model.DB, model.UserTaskFilter{
		Type:        strings.TrimSpace(c.Query("type")),
		Statuses:    parseTaskStatuses(c.Query("status")),
		UserID:      strings.TrimSpace(c.Query("user_id")),
		UserKeyword: strings.TrimSpace(c.Query("user_keyword")),
		ChannelID:   strings.TrimSpace(c.Query("channel_id")),
		Model:       strings.TrimSpace(c.Query("model")),
	}, page, pageSize)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data": userTaskListData{
			Items:    items,
			Total:    total,
			Page:     page,
			PageSize: pageSize,
		},
	})
}

// GetTask godoc
// @Summary Get async task by ID (admin)
// @Tags admin
// @Security BearerAuth
// @Produce json
// @Router /api/v1/admin/tasks/{id} [get]
func GetTask(c *gin.Context) {
	taskID := strings.TrimSpace(c.Param("id"))
	taskRow, err := model.GetAsyncTaskByIDWithDB(model.DB, taskID)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    taskRow,
	})
}

// GetUserTask godoc
// @Summary Get user task by task ID (admin)
// @Tags admin
// @Security BearerAuth
// @Produce json
// @Router /api/v1/admin/user/tasks/{id} [get]
func GetUserTask(c *gin.Context) {
	taskID := strings.TrimSpace(c.Param("id"))
	taskRow, err := model.GetUserTaskByTaskIDWithDB(model.DB, taskID)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    taskRow,
	})
}

// CancelTask godoc
// @Summary Cancel async task (admin)
// @Tags admin
// @Security BearerAuth
// @Produce json
// @Router /api/v1/admin/tasks/{id}/cancel [post]
func CancelTask(c *gin.Context) {
	taskID := strings.TrimSpace(c.Param("id"))
	taskRow, err := model.GetAsyncTaskByIDWithDB(model.DB, taskID)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	if taskRow.Status == model.AsyncTaskStatusRunning {
		if !CancelRunningTask(taskID) {
			c.JSON(http.StatusOK, gin.H{
				"success": false,
				"message": "运行中的任务当前不可取消",
			})
			return
		}
		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"message": "",
			"data":    taskRow,
		})
		return
	}
	taskRow, err = model.CancelAsyncTaskWithDB(model.DB, taskID)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    taskRow,
	})
}

// RetryTask godoc
// @Summary Retry async task (admin)
// @Tags admin
// @Security BearerAuth
// @Produce json
// @Router /api/v1/admin/tasks/{id}/retry [post]
func RetryTask(c *gin.Context) {
	taskID := strings.TrimSpace(c.Param("id"))
	taskRow, reused, err := model.RetryAsyncTaskWithDB(model.DB, taskID)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    taskRow,
		"meta": gin.H{
			"reused":   reused,
			"operator": c.GetString(ctxkey.Id),
		},
	})
}

// GetCurrentUserTasks godoc
// @Summary List current user tasks
// @Tags user
// @Security BearerAuth
// @Produce json
// @Router /api/v1/public/user/tasks [get]
func GetCurrentUserTasks(c *gin.Context) {
	page, pageSize := parsePageParams(c)
	userID := strings.TrimSpace(c.GetString(ctxkey.Id))
	items, total, err := model.ListUserTasksPageWithDB(model.DB, model.UserTaskFilter{
		Type:      strings.TrimSpace(c.Query("type")),
		Statuses:  parseTaskStatuses(c.Query("status")),
		UserID:    userID,
		ChannelID: strings.TrimSpace(c.Query("channel_id")),
		Model:     strings.TrimSpace(c.Query("model")),
	}, page, pageSize)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data": userTaskListData{
			Items:    items,
			Total:    total,
			Page:     page,
			PageSize: pageSize,
		},
	})
}

// GetCurrentUserTask godoc
// @Summary Get current user task by task ID
// @Tags user
// @Security BearerAuth
// @Produce json
// @Router /api/v1/public/user/tasks/{id} [get]
func GetCurrentUserTask(c *gin.Context) {
	taskID := strings.TrimSpace(c.Param("id"))
	userID := strings.TrimSpace(c.GetString(ctxkey.Id))
	taskRow, err := model.GetUserTaskByTaskIDWithDB(model.DB, taskID)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	if strings.TrimSpace(taskRow.UserID) != userID {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "任务不存在",
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    taskRow,
	})
}
