const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const port = process.env.PORT || 8000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(__dirname + '/views'));

// Route for the root URL
app.get('/', (req, res) => {
    // Check if there are any query parameters
    if (Object.keys(req.query).length === 0) {
        res.render("newchat"); // No query parameters
    } else {
        res.render('index'); // Has query parameters
    }
});
app.get('/*', (req, res) => {
    res.render('index');
});

// Create the HTTP server using the Express app
const server = http.createServer(app);

const socketIo = new Server(server, {
    cors: {
        origin: '*', // Allow any origin for testing purposes. This should be changed in production.
    },
});

const users = {}; // To store users in specific rooms

socketIo.on('connection', (socket) => {
    // Join a specific room
    socket.on('join-room', (roomId, name) => {
        socket.join(roomId);
        users[socket.id] = { name, roomId };
        socket.to(roomId).emit('user-joined', name); // Notify others in the room
        
        // Welcome message from AI
        setTimeout(() => {
            socket.emit('receive', { 
                message: `Hi ${name}! I'm the AI Assistant. Type <strong>@ai joke</strong> or <strong>@ai advice</strong> if you get bored!`, 
                name: 'AI Bot 🤖' 
            });
        }, 1000);
    });

    socket.on('typing', (name) => {
        const user = users[socket.id];
        if (user) socket.to(user.roomId).emit('typing', { name });
    });

    socket.on('stop-typing', (name) => {
        const user = users[socket.id];
        if (user) socket.to(user.roomId).emit('stop-typing', { name });
    });

    socket.on('send', async (message) => {
        const user = users[socket.id];
        if (user) {
            socket.to(user.roomId).emit('receive', { message: message, name: user.name });

            // AI Bot Integration
            if (message.toLowerCase().includes('@ai') || message.toLowerCase().startsWith('/ai')) {
                // Emit typing indicator from AI
                socketIo.to(user.roomId).emit('typing', { name: 'AI Bot 🤖' });
                
                const aiMessage = await getAiResponse(message);
                
                // Stop typing and send message
                socketIo.to(user.roomId).emit('stop-typing', { name: 'AI Bot 🤖' });
                socketIo.to(user.roomId).emit('receive', { message: aiMessage, name: 'AI Bot 🤖' });
            }
        }
    });

    socket.on('disconnect', () => {
        const user = users[socket.id];
        if (user) {
            socket.to(user.roomId).emit('left', user.name);
            delete users[socket.id];
        }
    });
});

const https = require('https');
function fetchJson(url) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers: { 'User-Agent': 'NodeJS/ChatApp' } }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
            });
        }).on('error', reject);
    });
}

function fetchText(url) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers: { 'User-Agent': 'NodeJS/ChatApp' } }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        }).on('error', reject);
    });
}

function searchWeb(query) {
    return new Promise((resolve) => {
        https.get(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                const match = data.match(/<a class="result__snippet[^>]*>([\s\S]*?)<\/a>/);
                if (match) {
                    resolve(match[1].replace(/<[^>]+>/g, '').trim());
                } else {
                    resolve(null);
                }
            });
        }).on('error', () => resolve(null));
    });
}

async function getAiResponse(msg) {
    const lowerMsg = msg.toLowerCase();
    
    // Simulate thinking delay
    await new Promise(res => setTimeout(res, 1500));

    try {
        if (lowerMsg.includes('joke')) {
            const data = await fetchJson('https://official-joke-api.appspot.com/random_joke');
            return `${data.setup} <br> <strong>${data.punchline}</strong> 😂`;
        } else if (lowerMsg.includes('advice')) {
            const data = await fetchJson('https://api.adviceslip.com/advice');
            return `Here is my advice: <em>"${data.slip.advice}"</em> 💡`;
        } else if (lowerMsg.includes('quote')) {
            const data = await fetchJson('https://dummyjson.com/quotes/random');
            return `<em>"${data.quote}"</em> <br> - <strong>${data.author}</strong>`;
        } else if (lowerMsg.includes('fact')) {
            const data = await fetchJson('https://uselessfacts.jsph.pl/api/v2/facts/random');
            return `Did you know? <strong>${data.text}</strong> 🧠`;
        } else if (lowerMsg.includes('dog')) {
            const data = await fetchJson('https://dog.ceo/api/breeds/image/random');
            return `Here's a cute dog for you! 🐶 <br> <img src="${data.message}" style="max-width: 250px; border-radius: 8px; margin-top: 5px;">`;
        } else if (lowerMsg.includes('trivia')) {
            const data = await fetchJson('https://opentdb.com/api.php?amount=1&type=multiple');
            if(data.results && data.results.length > 0) {
                 const q = data.results[0];
                 const options = [...q.incorrect_answers, q.correct_answer].sort(() => Math.random() - 0.5);
                 return `<strong>Trivia Time!</strong> 🎲 <br> ${q.question} <br> Options: <ul><li>${options.join('</li><li>')}</li></ul>`;
            }
            return "I'm out of trivia questions right now!";
        } else if (lowerMsg.match(/^@ai\s+(.*)/)) {
            const match = lowerMsg.match(/^@ai\s+(.*)/);
            let rawQuery = match[1].trim();

            try {
                // 1. Core LLM Brain: Try Pollinations Free Text AI API
                try {
                    const llmRes = await fetchText(`https://text.pollinations.ai/${encodeURIComponent(rawQuery)}`);
                    if (llmRes && llmRes.length > 0 && !llmRes.toLowerCase().includes("error") && !llmRes.toLowerCase().includes("queue full")) {
                        return llmRes.replace(/\n/g, '<br>');
                    }
                } catch(e) {
                    // Ignore LLM error, proceed to fallback
                }

                // 2. Translate query to English and detect language
                const translationReq = await fetchJson(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(rawQuery)}`);
                let enQuery = '';
                translationReq[0].forEach(t => { if(t[0]) enQuery += t[0]; });
                let detectedLang = translationReq[2] || 'en';

                let answer = "";

                // 3. Knowledge Fallback: Try to answer using Wikipedia using the English query
                try {
                    const cleanQuery = enQuery.replace(/^(what is|who is|tell me about)\s+/i, '').replace(/^(what are|who are)\s+/i, '').replace(/^(the|a|an)\s+/i, '').replace(/\?$/, '').trim();
                    const wikiData = await fetchJson(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(cleanQuery)}`);
                    
                    if (wikiData && wikiData.extract) {
                        answer = `Here is what I found:\n${wikiData.extract}`;
                    }
                } catch (wikiErr) {
                    // Ignore Wikipedia error
                }

                // 4. Web Search Fallback: If Wikipedia didn't know, search the open web!
                if (!answer) {
                    const webSnippet = await searchWeb(enQuery);
                    if (webSnippet && webSnippet.length > 10) {
                        answer = `Based on my web search:\n${webSnippet}`;
                    }
                }

                // 5. Ultimate Conversational Fallback if everything else failed
                if (!answer) {
                    if (enQuery.toLowerCase().includes('how are you') || enQuery.toLowerCase().includes('kya haal')) {
                        answer = "I am fully operational and doing great! I'm here to assist you with anything you need.";
                    } else if (enQuery.toLowerCase().includes('hello') || enQuery.toLowerCase().includes('hi')) {
                        answer = "Hello there! How can I help you today?";
                    } else if (enQuery.toLowerCase().includes('what to do') || enQuery.toLowerCase().includes('what should i do')) {
                        answer = "You should focus on your goals, learn something new, or maybe just relax and play the Endless Snake game in the settings menu!";
                    } else if (enQuery.toLowerCase().includes('name') || enQuery.toLowerCase().includes('who are you')) {
                        answer = "I am the platform's advanced AI Bot. I'm here to chat, answer questions, and keep you entertained.";
                    } else {
                        // Never say "I don't know"
                        answer = "That is a fascinating topic! I am constantly learning, but I'm here with you right now. Try asking me a different factual question!";
                    }
                }

                // 5. Translate answer back to user's language if it's not English
                if (detectedLang !== 'en') {
                    const backTransReq = await fetchJson(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${detectedLang}&dt=t&q=${encodeURIComponent(answer)}`);
                    let translatedAnswer = '';
                    backTransReq[0].forEach(t => { if(t[0]) translatedAnswer += t[0]; });
                    return translatedAnswer.replace(/\n/g, '<br>');
                } else {
                    return answer.replace(/\n/g, '<br>');
                }
            } catch (err) {
                // If even Google Translate fails, fall back gracefully
                return `I am currently optimizing my language modules. Please check back in a few seconds! ⚡`;
            }
        } else {
            return "I am an AI assistant here to keep you entertained! Try saying <strong>@ai joke</strong>, <strong>@ai quote</strong>, <strong>@ai fact</strong>, <strong>@ai dog</strong>, <strong>@ai trivia</strong>, or ask me absolutely anything like <strong>@ai kya karu mai?</strong>";
        }
    } catch (e) {
        return "I am taking a microsecond break to cool down my circuits. Try again soon! ⚡";
    }
}

server.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
