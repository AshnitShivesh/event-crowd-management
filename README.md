Event Crowd Management System

A real-time event crowd monitoring and decision support system designed to help event organizers monitor crowd distribution, identify congestion, track movement, and respond to changing crowd conditions.

Overview

The Event Crowd Management System provides a configurable environment where organizers can create events, define monitored zones and checkpoints, register participants, record movement, and monitor crowd conditions through a centralized dashboard.

The system focuses on answering four practical questions:

Where are people concentrated?

How full is each zone?

Which zones are approaching capacity?

What areas require attention from the organizer?

Features

Event creation and event selection

Configurable zones with capacity limits

Checkpoint creation and zone assignment

Participant registration with unique tokens

Entry and exit tracking

Zone occupancy calculation

Utilization and crowd-status evaluation

Automatic crowd alerts

Event-level analytics

Recent tracking event history

LIVE and DEMO modes

Normal, Surge, and Clearing simulations

PostgreSQL database

REST API backend

Socket.IO backend foundation for real-time updates



Dashboard

The dashboard provides an event-level overview of total capacity, current occupancy, utilization, active alerts, and zone-wise crowd status.
<img width="1834" height="899" alt="image" src="https://github.com/user-attachments/assets/bf1a87fe-ab04-4660-bbad-e8f0c2d37e02" />



Event Setup and Tracking

Organizers can configure events, zones, checkpoints, and participants, then record participant movement through the tracking interface.
<img width="1887" height="980" alt="image" src="https://github.com/user-attachments/assets/f8294765-460e-44fc-a73e-70fef847900a" />



Analytics and Alerts

The analytics section summarizes entries, exits, tracking events, and the busiest zone. Active alerts highlight zones that require attention.

<img width="1827" height="975" alt="image" src="https://github.com/user-attachments/assets/d261555c-e196-4ae1-bed5-dc2ed97bfd2a" />


Recent Tracking Events

Recent participant movement is displayed with participant, zone, checkpoint, direction, source, and timestamp information.



System Architecture

                    EVENT ORGANIZER
                           |
                           v
                 +-------------------+
                 |   React Frontend  |
                 |     Dashboard     |
                 +---------+---------+
                           |
                       REST API
                           |
                           v
                 +-------------------+
                 |  Node.js/Express  |
                 |      Backend      |
                 +---------+---------+
                           |
                 +---------+---------+
                 |                   |
                 v                   v
          +-------------+     +-------------+
          | PostgreSQL  |     |  Socket.IO  |
          |  Database   |     | Real-time   |
          +-------------+     +-------------+

Crowd Monitoring Flow

Participant
    |
    v
Identification
(QR / NFC / RFID / Barcode)
    |
    v
Checkpoint
    |
    v
Tracking Event
    |
    v
Zone Occupancy Update
    |
    v
Utilization Calculation
    |
    v
Status Evaluation
    |
    +----------+----------+
               |
        +------+------+
        |             |
        v             v
    Dashboard       Alert

The current MVP uses checkpoint-based tracking. If movement occurs without passing a monitored checkpoint, that movement cannot be directly observed by the system.

Technology Stack

Frontend

React.js

Vite

JavaScript

HTML

CSS

Backend

Node.js

Express.js

REST APIs

CORS

Database

PostgreSQL

pg PostgreSQL client

Real-Time Communication

Socket.IO

WebSockets

Tools

npm

Git

GitHub

VS Code

Project Structure

event-crowd-management/
|
+-- client/
|   +-- src/
|   |   +-- App.jsx
|   |   +-- api.js
|   |   +-- App.css
|   |   +-- index.css
|   +-- package.json
|
+-- server/
|   +-- index.js
|   +-- db.js
|   +-- schema.sql
|   +-- package.json
|
+-- docs/
|   +-- screenshots/
|
+-- README.md

Database Design

The application uses PostgreSQL with the following main entities:

events — event information

zones — monitored areas and capacities

checkpoints — detection points assigned to zones

participants — registered participants and tokens

tracking_events — participant movement history

alerts — crowd condition alerts

The main relationship is:

events
  |
  +-- zones
       |
       +-- checkpoints
       |
       +-- tracking_events
       |
       +-- alerts

participants
  |
  +-- tracking_events

API Endpoints

Events

GET  /api/events
GET  /api/events/:id
POST /api/events

Zones

GET  /api/events/:eventId/zones
POST /api/zones

Checkpoints

GET  /api/checkpoints
POST /api/checkpoints

Participants

GET  /api/participants
POST /api/participants

Tracking

GET  /api/tracking
POST /api/tracking

Dashboard and Analytics

GET /api/dashboard/:eventId
GET /api/analytics/:eventId
GET /api/alerts
GET /api/health

Installation

Prerequisites

Node.js

npm

PostgreSQL

Git

Clone the repository

git clone <your-repository-url>
cd event-crowd-management

Setup PostgreSQL

Create a database named:

event_crowd_management

Then execute server/schema.sql using PostgreSQL or a PostgreSQL administration tool.

Backend setup

cd server
npm install

Create server/.env and configure the PostgreSQL credentials. Do not commit .env to GitHub.

Start the backend:

node index.js

The backend runs on:

http://localhost:5000

Frontend setup

Open another terminal:

cd client
npm install
npm run dev

Open the local URL shown by Vite.

Demo Mode

The application includes DEMO mode for presenting the system without physical scanning hardware.

Normal

Simulates normal participant movement.

Surge

Generates multiple entry events to simulate a sudden increase in crowd occupancy.

Clearing

Generates exit events to simulate a zone clearing out.

This allows the dashboard, utilization values, and alert system to be demonstrated during testing or presentation.

Alert Logic

Zone utilization is evaluated against capacity thresholds to determine the current crowd condition.

Utilization

Status

Below 75%

NORMAL

75% - 89%

WARNING

90% - 99%

HIGH

100% or above

CRITICAL

The backend also prevents repeated active alerts for the same zone and can resolve an active alert when the zone returns to a normal condition.

Design Approach

The system is configurable rather than tied to one specific venue. Organizers can create their own events, zones, and checkpoints.

The identification method is also designed to be extendable. The current MVP uses QR-style participant tokens, while the checkpoint model can support other identification mechanisms such as NFC, RFID, and barcode scanning.

The core processing pipeline is:

Tracking Input
     |
     v
Tracking Event
     |
     v
Occupancy
     |
     v
Utilization
     |
     v
Zone Status
     |
     v
Alert / Decision Support

Current Limitations

The MVP relies on checkpoint-based tracking.

Occupancy depends on recorded entry and exit events.

Continuous physical-location tracking is not implemented.

QR-style participant tokens are used for the current tracking workflow.

Advanced hardware such as RFID readers, BLE beacons, and computer vision can be integrated in future versions.

Future Enhancements

NFC and RFID reader integration

Barcode scanner integration

BLE-based location tracking

Expanded Socket.IO real-time dashboard updates

Historical occupancy graphs

Peak occupancy analysis

Crowd growth and clearing rates

Predictive congestion detection

Authentication and role-based access

Cloud deployment using managed infrastructure

Production monitoring, logging, and security controls

Security
For local development, database credentials are stored through environment variables. Production deployment should additionally use HTTPS, authentication, authorization, input validation, database access controls, rate limiting, and secure logging.
Never commit passwords, API keys, or .env files to the repository.

Project Goal

The project aims to provide event organizers with a centralized view of crowd conditions and convert participant movement data into useful operational information.

Instead of only asking how many people attended an event, the system focuses on where people are, how crowded each zone is, how conditions are changing, and which areas require attention.

License

This project is developed for academic and educational purposes.
