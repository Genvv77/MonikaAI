import React, { useEffect, useRef, useState } from 'react';
import { createChart, CrosshairMode } from 'lightweight-charts';

const formatPrice = (price) => {
    if (!price && price !== 0) return "0.00";
    if (price >= 1000) return price.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    if (price >= 10) return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return price.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
};

const CustomChart = ({ symbol, position, currentPrice, candlesData, smaData, markers, availablePairs, activeTimeframe, onTimeframeChange, rsiValue, tradePlan }) => {
    const chartContainerRef = useRef(null);
    const chartRef = useRef(null);
    const candlestickSeriesRef = useRef(null);
    const smaSeriesRef = useRef(null);
    const volumeSeriesRef = useRef(null);
    const [chartReady, setChartReady] = useState(false);

    // RSI Color Logic
    let rsiColor = "text-gray-500";
    if (rsiValue < 30) rsiColor = "text-green-400 font-bold animate-pulse";
    else if (rsiValue > 70) rsiColor = "text-red-400 font-bold animate-pulse";

    // --- ⚡ LIVE PNL CALCULATION ---
    let livePnL = 0;
    let livePnLPercent = 0;
    let isWin = false;
    let entryPriceDisplay = 0;

    if (position) {
        // Normalize data keys (handle both entry/entryPrice and size/amount)
        const entry = parseFloat(position.entry || position.entryPrice || 0);
        const size = parseFloat(position.size || position.amount || 0);
        const mark = parseFloat(currentPrice || 0);

        if (entry > 0 && mark > 0) {
            // Formula: (Current Price - Entry Price) * Size
            livePnL = (mark - entry) * size;
            // Formula: ((Current Price - Entry Price) / Entry Price) * 100
            livePnLPercent = ((mark - entry) / entry) * 100;
        }

        isWin = livePnL >= 0;
        entryPriceDisplay = entry;
    }

    useEffect(() => {
        if (!chartContainerRef.current) return;

        // Determine precision based on price
        let precision = 2;
        let minMove = 0.01;

        if (currentPrice >= 1000) {
            precision = 0;
            minMove = 1;
        } else if (currentPrice < 10) {
            precision = 4;
            minMove = 0.0001;
        }

        if (minMove <= 0) minMove = 0.000001;

        // Create chart
        const chart = createChart(chartContainerRef.current, {
            layout: {
                background: { color: '#0D1117' },
                textColor: '#8B949E',
            },
            grid: {
                vertLines: { color: '#161B22' },
                horzLines: { color: '#161B22' },
            },
            width: chartContainerRef.current.clientWidth,
            height: chartContainerRef.current.clientHeight,
            crosshair: {
                mode: CrosshairMode.Normal,
            },
            timeScale: {
                visible: true,
                timeVisible: true,
                secondsVisible: false,
                borderColor: '#161B22',
                fixLeftEdge: true,
                fixRightEdge: true,
                rightOffset: 5,
            },
            rightPriceScale: {
                borderColor: '#161B22',
                visible: true,
                autoScale: true,
            },
        });

        const candlestickSeries = chart.addCandlestickSeries({
            upColor: '#26a69a',
            downColor: '#ef5350',
            borderVisible: false,
            wickUpColor: '#26a69a',
            wickDownColor: '#ef5350',
            priceFormat: {
                type: 'price',
                precision: precision,
                minMove: minMove,
            },
        });

        const volumeSeries = chart.addHistogramSeries({
            color: '#26a69a',
            priceFormat: { type: 'volume' },
            priceScaleId: 'vol',
        });

        chart.priceScale('vol').applyOptions({
            scaleMargins: {
                top: 0.8,
                bottom: 0,
            },
            visible: false,
        });

        const smaSeries = chart.addLineSeries({
            color: '#F97316',
            lineWidth: 2,
            crosshairMarkerVisible: false,
            lastValueVisible: false,
            priceLineVisible: false,
        });

        chartRef.current = chart;
        candlestickSeriesRef.current = candlestickSeries;
        smaSeriesRef.current = smaSeries;
        volumeSeriesRef.current = volumeSeries;

        setChartReady(true);

        const resizeObserver = new ResizeObserver(entries => {
            if (entries.length === 0 || !entries[0].target) return;
            const { width, height } = entries[0].contentRect;
            chart.applyOptions({ width, height });
        });

        resizeObserver.observe(chartContainerRef.current);

        return () => {
            setChartReady(false);
            resizeObserver.disconnect();
            chart.remove();
        };
    }, []);

    // Update data
    useEffect(() => {
        if (!candlestickSeriesRef.current || !chartRef.current) return;

        try {
            if (candlesData && Array.isArray(candlesData) && candlesData.length > 0) {
                candlestickSeriesRef.current.setData(candlesData);

                if (chartRef.current && volumeSeriesRef.current) {
                    try {
                        const volData = candlesData
                            .filter(c => c && typeof c.value === 'number')
                            .map(c => ({
                                time: c.time,
                                value: c.value,
                                color: c.close >= c.open ? 'rgba(38, 166, 154, 0.5)' : 'rgba(239, 83, 80, 0.5)'
                            }));

                        if (volData.length > 0) {
                            volumeSeriesRef.current.setData(volData);
                        }
                    } catch (innerErr) {
                        console.warn("[Chart] Volume Update Failed:", innerErr);
                    }
                }
            }
        } catch (e) {
            console.error(`[Chart Error] Failed to set candles:`, e);
        }

        try {
            if (smaData && Array.isArray(smaData) && smaData.length > 0 && smaSeriesRef.current) {
                smaSeriesRef.current.setData(smaData);
            }
        } catch (e) {
            console.error(`[Chart Error] Failed to set SMA:`, e);
        }

    }, [candlesData, smaData, symbol]);

    // Draw Tactical Lines
    const priceLinesRef = useRef([]);

    useEffect(() => {
        if (!chartReady || !candlestickSeriesRef.current) return;

        priceLinesRef.current.forEach(line => {
            try { candlestickSeriesRef.current.removePriceLine(line); } catch (e) { }
        });
        priceLinesRef.current = [];

        if (position) {
            const entry = parseFloat(position.entry || position.entryPrice || 0);

            if (!isNaN(entry) && entry > 0) {
                try {
                    const entryLine = candlestickSeriesRef.current.createPriceLine({
                        price: entry,
                        color: '#3b82f6',
                        lineWidth: 2,
                        lineStyle: 0,
                        axisLabelVisible: true,
                        title: 'ENTRY',
                    });
                    priceLinesRef.current.push(entryLine);

                    const tpPrice = entry * 1.05;
                    const tpLine = candlestickSeriesRef.current.createPriceLine({
                        price: tpPrice,
                        color: '#22c55e',
                        lineWidth: 1,
                        lineStyle: 2,
                        axisLabelVisible: true,
                        title: 'TP (+5%)',
                    });
                    priceLinesRef.current.push(tpLine);

                    const slPrice = entry * 0.85;
                    const slLine = candlestickSeriesRef.current.createPriceLine({
                        price: slPrice,
                        color: '#ef4444',
                        lineWidth: 1,
                        lineStyle: 1,
                        axisLabelVisible: true,
                        title: 'SL (-15%)',
                    });
                    priceLinesRef.current.push(slLine);

                    const dcaLevels = [0.95, 0.90];
                    dcaLevels.forEach((level, i) => {
                        const dcaPrice = entry * level;
                        const dcaLine = candlestickSeriesRef.current.createPriceLine({
                            price: dcaPrice,
                            color: '#eab308',
                            lineWidth: 1,
                            lineStyle: 2,
                            axisLabelVisible: true,
                            title: `DCA ${i + 1} (-${Math.round((1 - level) * 100)}%)`,
                        });
                        priceLinesRef.current.push(dcaLine);
                    });
                } catch (e) {
                    console.error("Failed to draw chart lines:", e);
                }
            }
        }

    }, [position, tradePlan, chartReady]);

    // --- LIVE CANDLE UPDATE ---
    useEffect(() => {
        if (!chartReady || !candlestickSeriesRef.current || !candlesData || candlesData.length === 0) return;

        const lastCandle = candlesData[candlesData.length - 1];
        if (lastCandle) {
            const updatedCandle = {
                ...lastCandle,
                close: currentPrice,
                high: Math.max(lastCandle.high, currentPrice),
                low: Math.min(lastCandle.low, currentPrice)
            };
            candlestickSeriesRef.current.update(updatedCandle);
        }
    }, [currentPrice, chartReady, candlesData]);

    useEffect(() => {
        if (!candlestickSeriesRef.current) return;
        if (markers) {
            candlestickSeriesRef.current.setMarkers(markers);
        }
    }, [markers]);

    return (
        <div className="w-full h-full flex flex-col">
            {/* Header */}
            <div className="flex justify-between items-center p-3 border-b border-gray-800">
                <div className="flex items-center gap-3">
                    <h3 className="text-sm font-bold text-white">{symbol}</h3>
                    <div className="flex flex-col">
                        <span className="text-lg font-mono font-bold text-green-400 leading-none">${formatPrice(currentPrice)}</span>
                        {rsiValue && <span className={`text-[10px] font-mono ${rsiColor}`}>Chart RSI: {rsiValue}</span>}
                    </div>
                </div>

                <div className="flex gap-1 text-[10px]">
                    {['1H', '4H', '1D', '1W', '1M'].map(tf => (
                        <button
                            key={tf}
                            onClick={() => onTimeframeChange && onTimeframeChange(tf)}
                            className={`px-2 py-1 rounded transition-colors ${activeTimeframe === tf
                                ? 'bg-[#238636] text-white font-bold shadow-lg shadow-green-900/50'
                                : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'
                                }`}
                        >
                            {tf}
                        </button>
                    ))}
                </div>
            </div>

            {/* Chart Container */}
            <div ref={chartContainerRef} className="flex-1 relative">
                {(!candlesData || candlesData.length === 0) && (
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div className="text-gray-600 text-sm">
                            Loading chart data...
                        </div>
                    </div>
                )}
            </div>


        </div>
    );
};

export default CustomChart;
