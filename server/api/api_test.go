package api

import (
	"database/sql"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/mattermost/focalboard/server/model"
	"github.com/mattermost/mattermost-server/v6/shared/mlog"
	"github.com/stretchr/testify/require"

	pluginapi "github.com/mattermost/mattermost-plugin-api"
)

func TestErrorResponse(t *testing.T) {
	testAPI := API{logger: mlog.CreateConsoleTestLogger(false, mlog.LvlDebug)}

	testCases := []struct {
		Name         string
		Error        error
		ResponseCode int
		ResponseBody string
	}{
		// bad request
		{"ErrBadRequest", model.NewErrBadRequest("bad field"), http.StatusBadRequest, "bad field"},
		{"ErrViewsLimitReached", model.ErrViewsLimitReached, http.StatusBadRequest, "limit reached"},
		{"ErrAuthParam", model.NewErrAuthParam("password is required"), http.StatusBadRequest, "password is required"},
		{"ErrInvalidCategory", model.NewErrInvalidCategory("open"), http.StatusBadRequest, "open"},
		{"ErrBoardMemberIsLastAdmin", model.ErrBoardMemberIsLastAdmin, http.StatusBadRequest, "no admins"},
		{"ErrBoardIDMismatch", model.ErrBoardIDMismatch, http.StatusBadRequest, "Board IDs do not match"},

		// unauthorized
		{"ErrUnauthorized", model.NewErrUnauthorized("not enough permissions"), http.StatusUnauthorized, "not enough permissions"},

		// forbidden
		{"ErrForbidden", model.NewErrForbidden("not enough permissions"), http.StatusForbidden, "not enough permissions"},
		{"ErrPermission", model.NewErrPermission("not enough permissions"), http.StatusForbidden, "not enough permissions"},
		{"ErrPatchUpdatesLimitedCards", model.ErrPatchUpdatesLimitedCards, http.StatusForbidden, "cards that are limited"},
		{"ErrCategoryPermissionDenied", model.ErrCategoryPermissionDenied, http.StatusForbidden, "doesn't belong to user"},

		// not found
		{"ErrNotFound", model.NewErrNotFound("board"), http.StatusNotFound, "board"},
		{"ErrNotAllFound", model.NewErrNotAllFound("block", []string{"1", "2"}), http.StatusNotFound, "not all instances of {block} in {1, 2} found"},
		{"sql.ErrNoRows", sql.ErrNoRows, http.StatusNotFound, "rows"},
		{"mattermost-plugin-api/ErrNotFound", pluginapi.ErrNotFound, http.StatusNotFound, "not found"},
		{"ErrNotFound", model.ErrCategoryDeleted, http.StatusNotFound, "category is deleted"},

		// not implemented
		{"ErrNotFound", model.ErrInsufficientLicense, http.StatusNotImplemented, "appropriate license required"},
	}

	for _, tc := range testCases {
		t.Run(fmt.Sprintf("%s should be a %d code", tc.Name, tc.ResponseCode), func(t *testing.T) {
			r := httptest.NewRequest(http.MethodGet, "/test", nil)
			w := httptest.NewRecorder()

			testAPI.errorResponse(w, r, tc.Error)
			res := w.Result()

			require.Equal(t, tc.ResponseCode, res.StatusCode)
			require.Equal(t, "application/json", res.Header.Get("Content-Type"))
			b, rErr := io.ReadAll(res.Body)
			require.NoError(t, rErr)
			res.Body.Close()
			require.Contains(t, string(b), tc.ResponseBody)
		})
	}
}
