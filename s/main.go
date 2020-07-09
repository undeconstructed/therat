package main

import (
	"encoding/json"
	"flag"
	"log"
	"net/http"
	"os"
	"path"
	"strings"

	"github.com/gorilla/websocket"
)

var lfile = flag.String("lesson", "", "lesson file")
var addr = flag.String("addr", "localhost:8080", "http service address")

var upgrader = websocket.Upgrader{} // use default options

// JSONLoginResponse is for sending to the client
type JSONLoginResponse struct {
	Token string `json:"token"`
	Name  string `json:"name"`
	Host  bool   `json:"host"`
}

func main() {
	log.Printf("running %s", os.Args[0])

	flag.Parse()
	log.SetFlags(0)

	// l := newLesson("lesson one")
	l, err := loadLesson(*lfile)
	if err != nil {
		log.Fatal(err)
	}

	state, _ := l.JSON()
	log.Printf("state: %s", state)

	go l.Run()

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
		a := q.Get("auth")
		res, err := l.Login(a)
		if err != nil {
			w.WriteHeader(401)
			w.Write([]byte(err.Error()))
			return
		}

		w.WriteHeader(200)
		j, _ := json.Marshal(JSONLoginResponse{res.token, res.name, res.host})
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

		b, _ := l.JSON()
		w.Write(b)
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
		token := q.Get("token")
		if token == "" {
			w.WriteHeader(401)
			return
		}
		// TODO - get from param

		c, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			log.Print("upgrade:", err)
			return
		}
		defer c.Close()

		run, err := l.Connect(token, c)
		if err != nil {
			// w.WriteHeader(400)
			return
		}

		run()
	})

	log.Fatal(http.ListenAndServe(*addr, nil))
}
