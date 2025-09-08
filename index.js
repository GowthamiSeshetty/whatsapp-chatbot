const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys')
const sqlite3 = require('sqlite3').verbose()
const path = require('path')

// Persistent storage paths
const AUTH_PATH = '/auth'
const DB_PATH = '/db'

// Setup SQLite DB
const db = new sqlite3.Database(path.join(DB_PATH, 'tickets.db'))
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS tickets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user TEXT,
        type TEXT,
        message TEXT,
        status TEXT DEFAULT 'open',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`)
})

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_PATH)
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true,
        browser: ['Windows', 'Chrome', '10.0'],
    })

    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut
            console.log('Connection closed, reconnecting:', shouldReconnect)
            if (shouldReconnect) startBot()
        } else if (connection === 'open') {
            console.log('✅ WhatsApp Bot Connected')
        }
    })

    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0]
        if (!msg.key.fromMe) {
            const from = msg.key.remoteJid
            const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || ''
            const lowerText = text.toLowerCase()

            if (lowerText.includes('hi') || lowerText.includes('hello')) {
                await sock.sendMessage(from, {
                    text: 'Hello! Welcome to NextGen Solutions.\nPlease reply with:\n1. Technical Support\n2. Service Booking\n3. Status Update',
                })
            } else if (lowerText === '1') {
                await sock.sendMessage(from, { text: 'You selected Technical Support. Please describe your issue.' })
                db.run(`INSERT INTO tickets(user,type,message) VALUES(?,?,?)`, [from, 'Technical Support', 'Pending user description'])
            } else if (lowerText === '2') {
                await sock.sendMessage(from, { text: 'You selected Service Booking. Please share preferred date and time.' })
                db.run(`INSERT INTO tickets(user,type,message) VALUES(?,?,?)`, [from, 'Service Booking', 'Pending user details'])
            } else if (lowerText === '3') {
                db.all(`SELECT id,type,status,created_at FROM tickets WHERE user = ?`, [from], (err, rows) => {
                    if (err) {
                        sock.sendMessage(from, { text: 'Error fetching tickets.' })
                    } else if (rows.length === 0) {
                        sock.sendMessage(from, { text: 'No tickets found for you.' })
                    } else {
                        let reply = 'Your tickets:\n'
                        rows.forEach(r => {
                            reply += `ID:${r.id}, Type:${r.type}, Status:${r.status}, Created:${r.created_at}\n`
                        })
                        sock.sendMessage(from, { text: reply })
                    }
                })
            } else {
                await sock.sendMessage(from, { text: 'Please reply with 1, 2, or 3.' })
            }
        }
    })
}

startBot()
