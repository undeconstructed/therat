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

var lfile = flag.String("lesson", "", "lesson file")
var addr = flag.String("addr", "localhost:8080", "http service address")

var upgrader = websocket.Upgrader{} // use default options

func main() {
	flag.Parse()
	log.SetFlags(0)

	// l := newLesson("lesson one")
	l, err := loadLesson(*lfile)
	if err != nil {
		log.Fatal(err)
	}

	go l.run()

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
		t, err := l.login(n)
		if err != nil {
			w.WriteHeader(401)
			w.Write([]byte(err.Error()))
			return
		}

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
		token := q.Get("token")
		if token == "" {
			w.WriteHeader(401)
			return
		}

		c, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			log.Print("upgrade:", err)
			return
		}
		defer c.Close()

		client, err := l.connect(token, c)
		if err != nil {
			w.WriteHeader(400)
			return
		}

		client.run()
	})

	log.Fatal(http.ListenAndServe(*addr, nil))
}
