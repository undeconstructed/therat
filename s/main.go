package main

import (
	"encoding/json"
	"flag"
	"log"
	"net/http"
	"path"
	"strings"

	"github.com/gorilla/websocket"
)

var addr = flag.String("addr", "localhost:8080", "http service address")

var upgrader = websocket.Upgrader{} // use default options

type loginRequest struct {
	Name string `json:"name"`
}

type loginResponse struct {
	Token string `json:"token"`
}

type clientMessage struct {
	Message string `json:"message"`
}

func main() {
	flag.Parse()
	log.SetFlags(0)

	l := newLesson("lesson one")
	l.start()

	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "/c/", 301)
	})

	http.HandleFunc("/c/", func(w http.ResponseWriter, r *http.Request) {
		name0 := strings.TrimPrefix(r.URL.Path, "/c/")
		name1 := path.Join("c", name0)
		http.ServeFile(w, r, name1)
	})

	http.HandleFunc("/s/", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(200)
		w.Write([]byte("s"))
	})

	http.HandleFunc("/s/login", func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		n := q.Get("name")
		t, _ := l.login(n)
		w.WriteHeader(200)
		j, _ := json.Marshal(loginResponse{t})
		w.Write(j)
	})

	http.HandleFunc("/s/data", func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		t := q.Get("token")
		if t == "" {
			w.WriteHeader(401)
			return
		}

		w.Header().Add("Content-Type", "application/json")
		w.WriteHeader(200)
		j, _ := json.Marshal(l)
		w.Write(j)
	})

	http.HandleFunc("/s/events", func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		t := q.Get("token")
		if t == "" {
			w.WriteHeader(401)
			return
		}

		w.WriteHeader(200)
		w.Write([]byte("s"))
	})

	http.HandleFunc("/s/sync", func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		t := q.Get("token")
		if t == "" {
			w.WriteHeader(401)
			return
		}

		toUser := make(chan interface{})
		_, err := l.connect(t, toUser)
		if err != nil {
			w.WriteHeader(400)
			return
		}

		c, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			log.Print("upgrade:", err)
			return
		}
		defer c.Close()

		fromUser := make(chan []byte)

		go func() {
			for {
				_, message, err := c.ReadMessage()
				if err != nil {
					log.Println("read:", err)
					close(fromUser)
					break
				}
				fromUser <- message
			}
		}()

		for {
			select {
			case m, ok := <-fromUser:
				if !ok {
					log.Printf("user gone: %s", t)
					l.disconnect(t)
					return
				}
				log.Printf("from user: %s %v", t, m)
			case m, ok := <-toUser:
				if !ok {
					log.Printf("user kicked: %s", t)
					return
				}
				log.Printf("to user: %s %v", t, m)
				j, _ := json.Marshal(m)
				err = c.WriteMessage(websocket.TextMessage, j)
				if err != nil {
					log.Println("write:", err)
				}
			}
		}
	})

	log.Fatal(http.ListenAndServe(*addr, nil))
}
