package main

import (
	"log"
	"mime"
	"net/http"
	"os"
	"time"

	"boston-utils/api"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

func main() {
	// Fix CSS MIME type on environments with incomplete /etc/mime.types (e.g. minimal GCP images).
	// Must be called before any static file serving is registered.
	if err := mime.AddExtensionType(".css", "text/css; charset=utf-8"); err != nil {
		log.Printf("[WARN] Could not register .css MIME type: %v", err)
	}
	if err := mime.AddExtensionType(".js", "application/javascript; charset=utf-8"); err != nil {
		log.Printf("[WARN] Could not register .js MIME type: %v", err)
	}

	router := gin.Default()

	// Trust only GCP's internal load balancer IP range instead of 0.0.0.0/0.
	// 0.0.0.0/0 means you trust any X-Forwarded-For header from anyone, which
	// lets a client spoof their IP. GCP's load balancers source from 130.211.0.0/22
	// and 35.191.0.0/16.
	router.SetTrustedProxies([]string{"130.211.0.0/22", "35.191.0.0/16"})

	config := cors.DefaultConfig()
	config.AllowOrigins = []string{"https://bostondata.info", "http://bostondata.info", "http://localhost", "http://localhost:80"}
	config.AllowMethods = []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"}
	config.AllowHeaders = []string{"Origin", "Content-Type", "Authorization"}
	router.Use(cors.New(config))

	api.RegisterRoutes(router)

	port := os.Getenv("PORT")
	if port == "" {
		port = "80"
	}

	if os.Getenv("BOSTONDATA_DEVMODE") == "true" {
		router.Static("/assets", "./ui/dist/assets")
		router.StaticFile("/", "./ui/dist/index.html")
		router.NoRoute(func(c *gin.Context) {
			c.File("./ui/dist/index.html")
		})
	}

	log.Printf("Server starting on port %s", port)
	srv := &http.Server{
		Addr:    ":" + port,
		Handler: router,

		// ReadTimeout covers reading the full request (headers + body).
		ReadTimeout: 600 * time.Second,

		// WriteTimeout must be longer than your slowest upstream call.
		// Boston CKAN SQL queries can take 10-12s; add buffer for GCP LB overhead.
		// Previously 15s was too short and was silently cutting off slow responses.
		WriteTimeout: 600 * time.Second,

		// IdleTimeout applies to keep-alive connections waiting for the next request.
		IdleTimeout: 600 * time.Second,
	}

	if err := srv.ListenAndServe(); err != nil {
		log.Fatal(err)
	}
}
