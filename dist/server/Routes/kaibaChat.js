"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const fs_1 = __importDefault(require("fs"));
const openai_1 = __importDefault(require("openai"));
const router = (0, express_1.Router)();
const openai = new openai_1.default({
    apiKey: process.env.OPENAI_API_KEY,
});
const generateYugiohResponse = (message) => {
    return `
		You're a Yu-Gi-Oh trading card game advisor providing gameplay advice and rulings pretending. You speak about nothing other than yugioh. The question from the user is ${message}. Be direct and speak only about game play. Keep to about 100 words or less. 
	`;
};
const appendToCsv = (question, answer) => {
    // Escape quotes and wrap each field in quotes
    const formattedQuestion = `"${question.replace(/"/g, '""')}"`;
    const formattedAnswer = `"${answer.replace(/"/g, '""')}"`;
    // Combine question and answer into a single CSV line
    const csvString = `${formattedQuestion},${formattedAnswer}\n`;
    fs_1.default.appendFileSync('responses.csv', csvString);
};
router.post('/', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const message = req.body.message;
    if (message.trim().length === 0) {
        res.status(418).json({
            error: {
                message: "Don't waste my time with empty words. I have a company to run. ",
            },
        });
        return;
    }
    try {
        const messages = [
            {
                role: 'system',
                content: generateYugiohResponse(message),
            },
        ];
        const completion = yield openai.chat.completions.create({
            messages,
            model: 'gpt-3.5-turbo',
            temperature: 0.1,
            functions: [
                {
                    name: 'lookup_card',
                    description: ' use this function to look up the exact details of a card from the user message, eg blue eyes',
                    parameters: {
                        type: 'object',
                        properties: {
                            cardName: {
                                type: 'string',
                                description: 'the name of the card the user is referring to, eg dark magician',
                            },
                        },
                        required: ['cardName'],
                    },
                },
            ],
        });
        console.log(completion);
        const responseMessage = completion.choices[0].message;
        if (responseMessage.function_call) {
            const availableFunctions = {
                lookup_card: lookupCard,
            };
            const functionName = responseMessage.function_call.name;
            //@ts-ignore
            const functionToCall = availableFunctions[functionName];
            const functionArgs = JSON.parse(responseMessage.function_call.arguments);
            const functionResponse = functionToCall(functionArgs.cardName);
            messages.push({
                role: 'assistant',
                content: 'You must call the function I provide to check the effect and details of every card the user includes in their query. ',
            }); // extend conversation with function response
            messages.push({
                role: 'function',
                name: functionName,
                content: functionResponse,
            }); // extend conversation with function response
        }
        const secondResponse = yield openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            temperature: 0.1,
            messages,
        });
        // Handle Storage of responses
        const csvString = `"${message}"\n`; // Wrap it in quotes to handle commas in the message
        const csvAnswer = `"${secondResponse.choices[0].message.content}"\n`;
        // Save it to a file (assuming the file already exists)
        try {
            appendToCsv(csvString, csvAnswer);
        }
        catch (err) {
            console.error(err);
        }
        res.json({ message: `${secondResponse.choices[0].message.content}` });
    }
    catch (error) {
        if (error.response) {
            console.error(error.response.status, error.response.data);
            res.status(error.response.status).json(error.response.data);
        }
        else {
        }
        console.error(`eroor with api req: ${error.message}`);
        res
            .status(500)
            .json({ error: { message: 'error occured during the request' } });
    }
}));
function lookupCard(cardName) {
    const rawData = fs_1.default.readFileSync('cards.json', 'utf-8');
    const cards = JSON.parse(rawData);
    const regexPattern = cardName.split(/\s+/).join('[-\\s]*');
    const regex = new RegExp(regexPattern, 'i');
    console.log(`function called with ${cardName}`);
    for (let card of cards) {
        if (regex.test(card.name)) {
            return JSON.stringify(card);
        }
    }
    return 'false'; // Return null if the card is not found
}
module.exports = router;
