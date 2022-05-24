package server

import (
	"fmt"

	"github.com/mattermost/focalboard/server/services/config"
	"github.com/mattermost/focalboard/server/services/notify"
	"github.com/mattermost/focalboard/server/services/store"
	"github.com/mattermost/focalboard/server/ws"

	"github.com/mattermost/mattermost-server/v6/plugin"
	"github.com/mattermost/mattermost-server/v6/shared/mlog"

	pluginapi "github.com/mattermost/mattermost-plugin-api"
)

type Params struct {
	Cfg             *config.Configuration
	SingleUserToken string
	DBStore         store.Store
	Logger          *mlog.Logger
	ServerID        string
	WSAdapter       ws.Adapter
	NotifyBackends  []notify.Backend
	PluginAPI       plugin.API
	Client          *pluginapi.Client
}

func (p Params) CheckValid() error {
	if p.Cfg == nil {
		return ErrServerParam{name: "Cfg", issue: "cannot be nil"}
	}

	if p.DBStore == nil {
		return ErrServerParam{name: "DbStore", issue: "cannot be nil"}
	}

	if p.Logger == nil {
		return ErrServerParam{name: "Logger", issue: "cannot be nil"}
	}
	return nil
}

type ErrServerParam struct {
	name  string
	issue string
}

func (e ErrServerParam) Error() string {
	return fmt.Sprintf("invalid server params: %s %s", e.name, e.issue)
}
