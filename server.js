const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');

const app = express();
const PORT = 3000;

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.use(express.static(__dirname));
app.use(express.json());
app.use('/images', express.static(path.join(__dirname, 'images')));

app.get('/get-images', async (req, res) => {
    try {
    	const prompts = await fs.readdir('./images');
        let prompt = prompts[Math.floor(Math.random() * prompts.length)];
        const samplers = await fs.readdir(`./images/${prompt}`);
        if (samplers.length < 2) {
            return res.status(500).json({ error: 'Not enough samplers available' });
        }

        let selectedSampler1 = samplers[Math.floor(Math.random() * samplers.length)];
        let selectedSampler2;
        do {
            selectedSampler2 = samplers[Math.floor(Math.random() * samplers.length)];
        } while (selectedSampler1 === selectedSampler2);
        
	const imagecounts = await fs.readdir(`./images/${prompt}/${selectedSampler1}`);

	
	let imageNumber = 10 + 5 * Math.floor(Math.random() * imagecounts.length);


        const imagePath1 = `/images/${prompt}/${selectedSampler1}/image${imageNumber}.png`;
        const imagePath2 = `/images/${prompt}/${selectedSampler2}/image${imageNumber}.png`;
       
        res.json({ image1: imagePath1, image2: imagePath2 });

    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch images' });
    }
});

const analyzeResults = async () => {
    const resultsPath = path.join(__dirname, 'data', 'results.json');
    if (!resultsPath) {
    	await fs.writeFile(resultsPath);
    }
    
    const rawData = await fs.readFile(resultsPath, 'utf-8');
    const data = JSON.parse(rawData);

    let sampler_scores = {};
    let sampler_steps = {};
    let sampler_prompt_num = {};

    for (let entry of data) {
        for (let x of [1, 2]) {
            let y = x.toString();
            let sampler = entry['sampler' + y];
            let score = entry['score' + y];
            let steps = entry['steps'];
            let promptnum = entry['prompt'];

            if (!sampler_scores[sampler]) {
                sampler_scores[sampler] = 0;
                sampler_steps[sampler] = {steps};
                sampler_prompt_num[sampler] = {promptnum};
            }
	    
	    if (sampler_scores[sampler] + score <= 0) {
	    	sampler_scores[sampler] = 0;
	    }
	    else {
	    	sampler_scores[sampler] += score;
	    }
            sampler_steps[sampler][steps] += 1;
            sampler_prompt_num[sampler][promptnum] = (sampler_prompt_num[sampler][promptnum] || 0) + 1;
        }
    }
    
    return {
        sampler_scores: sampler_scores,
        sampler_steps: sampler_steps,
        sampler_prompt_num: sampler_prompt_num
    };
};

app.get('/get-graph-data', async (req, res) => {
    try {
        const data = await analyzeResults();
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to get graph data' });
    }
});

function extractData(imagePath) {
    // Split the path into its components
    const parts = imagePath.split('/');

    // Extract the sampler, prompt, and steps
    const sampler = parts[5];
    const prompt = parts[4];
    const steps = (parseInt(parts[6].replace('image', '').replace('.png', ''), 10));

    return { sampler, prompt, steps };
}


app.post('/record-choice', async (req, res) => {
    try {
        const { choice, image1Path: image1, image2Path: image2 } = req.body;

        console.log("Request body:", req.body); // Log the request body

        if (!image1 || !image2) {
            return res.status(400).json({ error: 'Image paths are missing' });
        }

	const resultsPath = path.join(__dirname, 'data', 'results.json');

	let results;
	try {
	    const rawData = await fs.readFile(resultsPath, 'utf-8');
	    results = JSON.parse(rawData);
	} catch (error) {
	    console.log("Error reading results file:", error.message); // Log the error message
	    results = [];
	    
	    // If the file doesn't exist, create it with an empty array
	    if (error.code === 'ENOENT') {
		console.log("Creating a new results file.");
		await fs.writeFile(resultsPath, JSON.stringify(results, null, 2));
	    }
	}

        const data1 = extractData(image1);
        const data2 = extractData(image2);

        let score1, score2;
        if (choice === 'image1') {
            score1 = 1;
            score2 = -1;
        } else if (choice === 'image2') {
            score1 = -1;
            score2 = 1;
        } else if (choice === 'identical') {
            score1 = score2 = 1;
        } else {
            score1 = score2 = -1;
        }

        results.push({
            sampler1: data1.sampler,
            score1: score1,
            sampler2: data2.sampler,
            score2: score2,
            prompt: data1.prompt,
            steps: data1.steps
        });

        await fs.writeFile(resultsPath, JSON.stringify(results, null, 2));
        res.json({ success: true });

    } catch (error) {
        console.error("Error recording choice:", error); // Log the entire error object
        res.status(500).json({ error: 'Failed to record choice' });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});

