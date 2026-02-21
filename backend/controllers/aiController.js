const ort = require('onnxruntime-node');
const path = require('path');

let session;

// Load the brain once when the server starts
const initBrain = async () => {
    try {
        const modelPath = path.resolve(__dirname, '../monika.onnx');
        session = await ort.InferenceSession.create(modelPath);
        console.log("Backend AI Brain: LOADED");
    } catch (e) {
        console.error("Brain load error:", e);
    }
};
initBrain();

exports.predictMove = async (req, res) => {
    try {
        const { prices } = req.body;
        // ... (The same tokenization math we used before) ...

        const results = await session.run({ input_ids: inputTensor });
        res.json({ prediction: labels[maxIdx], confidence: confidence });
    } catch (err) {
        res.status(500).json({ error: "Brain freeze" });
    }
};