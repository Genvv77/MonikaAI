import React, { useState, useEffect } from 'react';
import Joyride, { STATUS } from 'react-joyride';

const TutorialOverlay = () => {
    const [run, setRun] = useState(false);

    useEffect(() => {
        const hasSeen = localStorage.getItem('hasSeenTutorial');
        if (!hasSeen) {
            setRun(true);
        }
    }, []);

    const handleJoyrideCallback = (data) => {
        const { status } = data;
        if ([STATUS.FINISHED, STATUS.SKIPPED].includes(status)) {
            setRun(false);
            localStorage.setItem('hasSeenTutorial', 'true');
        }
    };

    const steps = [
        {
            target: 'body',
            content: "Welcome to Monika. I am your AI-powered trading agent. Let me show you around your new command center.",
            placement: 'center',
            disableBeacon: true,
        },
        {
            target: '#export-wallet',
            content: "Your Keys, Your Crypto. Click this to reveal and back up your Private Key. It lives in your RAM, so save it if you want to access funds later.",
        },
        {
            target: '#gas-fee',
            content: "The Fuel. You need at least 1 MON to pay for transaction fees. Without gas, the car won't move. You also need at least 1 USDC, this capital is used to trade.",
        },
        {
            target: '#market-stats',
            content: "The Confidence Meter. My AI Score (0-100%) blends Pattern Matching, Trend, and Momentum to decide when to trade.",
        },
        {
            target: '#price-chart',
            content: "The Visual Feed. I scan these candles for Market Structure (Bullish/Bearish) and Global Sentiment (Fear/Greed).",
        },
        {
            target: '#trading-terminal',
            content: "Command Deck. Switch between Manual and Auto modes here. 'Start Engine' enables the autopilot loop. Buying and selling positions for you. Even if you force buy a position, as long as the engine is running, monika will manage the position for you (as long as you don't close the tab!)",
        },
        {
            target: '#logs-panel',
            content: "Brain Scan. Watch my real-time decision logic here. If I skip a trade, I'll tell you why (e.g., 'RSI too high').",
        },
        {
            target: '#panic-sell',
            content: "Eject Button. Click this to immediately sell all volatile assets into USDC and shut down the engine.",
        },
    ];

    return (
        <Joyride
            steps={steps}
            run={run}
            continuous
            showSkipButton
            showProgress
            callback={handleJoyrideCallback}
            styles={{
                options: {
                    primaryColor: '#10B981', // Emerald Green
                    backgroundColor: '#1F2937', // Dark Gray
                    textColor: '#FFFFFF',
                    arrowColor: '#1F2937',
                    overlayColor: 'rgba(0, 0, 0, 0.6)',
                },
                buttonNext: {
                    backgroundColor: '#10B981',
                    color: '#000000',
                    fontWeight: 'bold',
                    padding: '8px 16px',
                    borderRadius: '4px',
                },
                buttonBack: {
                    color: '#9CA3AF',
                    marginRight: '10px',
                },
                buttonSkip: {
                    color: '#ef4444',
                },
                tooltipContainer: {
                    textAlign: 'left',
                    fontSize: '14px',
                    lineHeight: '1.5',
                },
            }}
        />
    );
};

export default TutorialOverlay;
