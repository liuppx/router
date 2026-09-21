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

// taskMaxPageSize 是任务列表 page_size 的硬上限。
const taskMaxPageSize = 100

func parsePageParams(c *gin.Context) (int, int) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	if page < 1 {
		page = 1
	}
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", strconv.Itoa(config.ItemsPerPage)))
	if pageSize < 1 {
		pageSize = config.ItemsPerPage
	}
	if pageSize > taskMaxPageSize {
		pageSize = taskMaxPageSize
	}
	return page, pageSize
}

// parseSortParams 读取 order_by/order,经 resolveColumn 白名单校验后返回安全列名与是否降序。
// order 仅接受 asc/desc,其它值(含空)一律回退 desc。
func parseSortParams(c *gin.Context, resolveColumn func(string) string) (string, bool) {
	column := resolveColumn(c.Query("order_by"))
	desc := !strings.EqualFold(strings.TrimSpace(c.Query("order")), "asc")
	return column, desc
}

func GetTasks(c *gin.Context) {
	page, pageSize := parsePageParams(c)
	sortColumn, sortDesc := parseSortParams(c, model.ResolveAsyncTaskSortColumn)
	items, total, err := model.ListAsyncTasksPageWithDB(model.DB, model.AsyncTaskFilter{
		Type:       strings.TrimSpace(c.Query("type")),
		Statuses:   parseTaskStatuses(c.Query("status")),
		ChannelId:  strings.TrimSpace(c.Query("channel_id")),
		Model:      strings.TrimSpace(c.Query("model")),
		SortColumn: sortColumn,
		SortDesc:   sortDesc,
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

func GetUserTasks(c *gin.Context) {
	page, pageSize := parsePageParams(c)
	sortColumn, sortDesc := parseSortParams(c, model.ResolveUserTaskSortColumn)
	items, total, err := model.ListUserTasksPageWithDB(model.DB, model.UserTaskFilter{
		Type:        strings.TrimSpace(c.Query("type")),
		Statuses:    parseTaskStatuses(c.Query("status")),
		UserID:      strings.TrimSpace(c.Query("user_id")),
		UserKeyword: strings.TrimSpace(c.Query("user_keyword")),
		ChannelID:   strings.TrimSpace(c.Query("channel_id")),
		Model:       strings.TrimSpace(c.Query("model")),
		SortColumn:  sortColumn,
		SortDesc:    sortDesc,
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

func GetCurrentUserTasks(c *gin.Context) {
	page, pageSize := parsePageParams(c)
	sortColumn, sortDesc := parseSortParams(c, model.ResolveUserTaskSortColumn)
	userID := strings.TrimSpace(c.GetString(ctxkey.Id))
	items, total, err := model.ListUserTasksPageWithDB(model.DB, model.UserTaskFilter{
		Type:       strings.TrimSpace(c.Query("type")),
		Statuses:   parseTaskStatuses(c.Query("status")),
		UserID:     userID,
		ChannelID:  strings.TrimSpace(c.Query("channel_id")),
		Model:      strings.TrimSpace(c.Query("model")),
		SortColumn: sortColumn,
		SortDesc:   sortDesc,
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
