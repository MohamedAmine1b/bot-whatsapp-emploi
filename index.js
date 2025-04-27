const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { google } = require('googleapis');
const fs = require('fs');
const { MessageMedia } = require('whatsapp-web.js');

// Initialize WhatsApp client
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: false,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox'
        ],
        waitForInitialPage: true
    }
});

// Display QR code for login
client.on('qr', qr => {
    qrcode.generate(qr, { small: true });
});

// When WhatsApp client is ready
client.on('ready', () => {
    console.log('✅ WhatsApp Bot is ready!');
});

// Google Drive Setup
const auth = new google.auth.GoogleAuth({
    keyFile: 'credentials.json', // Your Google service account JSON file
    scopes: ['https://www.googleapis.com/auth/drive.readonly']
});

const drive = google.drive({ version: 'v3', auth });

// Temporary storage for file list
let filesList = [];

// Main bot logic
client.on('message', async message => {
    const text = message.body.trim();

    // User asked to list files
    if (text.toLowerCase() === 'emploi') {
        try {
            const res = await drive.files.list({
                q: `'13m_nfB5sSgMNPJ0ob-UcXGvaDvrjTo6g' in parents and trashed=false`,
                fields: 'files(id, name)'
            });

            filesList = res.data.files;

            if (!filesList.length) {
                return message.reply('⚠️ No files found.');
            }

            let replyText = '📂 *Please choose a file:*\n\n';
            filesList.forEach((file, index) => {
                replyText += `${index + 1}. ${file.name}\n`;
            });

            await message.reply(replyText);

        } catch (error) {
            console.error(error);
            message.reply('⚠️ Error fetching file list.');
        }
    }
    // User selected a file by number
    else if (!isNaN(text) && filesList.length > 0) {
        const index = parseInt(text) - 1;
        if (index < 0 || index >= filesList.length) {
            return message.reply('❌ Invalid selection. Please type "emploi" again.');
        }

        const selectedFile = filesList[index];

        try {
            const dest = fs.createWriteStream(`./${selectedFile.name}`);

            await drive.files.get({ fileId: selectedFile.id, alt: 'media' }, { responseType: 'stream' })
                .then(res => {
                    return new Promise((resolve, reject) => {
                        res.data
                            .on('end', () => resolve())
                            .on('error', err => reject(err))
                            .pipe(dest);
                    });
                });

            await message.reply(`✅ Sending *${selectedFile.name}*...`);

            // Prepare the media for sending
            const media = MessageMedia.fromFilePath(`./${selectedFile.name}`);

            // Send the media as a document
            await message.reply(media, null, { sendMediaAsDocument: true });

            // Clean up local file
            fs.unlinkSync(`./${selectedFile.name}`);
            filesList = []; // Clear list after sending

        } catch (error) {
            console.error(error);
            message.reply('⚠️ Error downloading or sending the file.');
        }
    }
});

// Start WhatsApp bot
client.initialize().catch(err => {
    console.error('❌ Client failed to initialize:', err);
});
