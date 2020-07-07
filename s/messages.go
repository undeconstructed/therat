package main

import "encoding/json"

type loginRequest struct {
	Name string `json:"name"`
}

type loginResponse struct {
	Token string `json:"token"`
}

type clientMessage struct {
	Message string `json:"message"`
}

type updateMessage struct {
	Version int         `json:"version"`
	Path    string      `json:"path"`
	Data    interface{} `json:"data"`
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
