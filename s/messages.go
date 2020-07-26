package main

import "encoding/json"

// UserDef is for inputting users
type UserDef struct {
	Name string `json:"name"`
	Role string `json:"role"`
}

type clientMessage struct {
	Message string `json:"message"`
}

type updateMessage struct {
	Version int             `json:"version"`
	Path    string          `json:"path"`
	Data    json.RawMessage `json:"data"`
}

type updateMessage2 updateMessage

func (m updateMessage) MarshalJSON() ([]byte, error) {
	return json.Marshal(struct {
		Type string `json:"type"`
		updateMessage2
	}{
		Type:           "u",
		updateMessage2: updateMessage2(m),
	})
}
