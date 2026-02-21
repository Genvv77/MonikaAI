import React, { useEffect, useRef, useState } from 'react';
import { createChart, CrosshairMode } from 'lightweight-charts';

const formatPrice = (price) => {
    if (!price && price !== 0) return "0.00";
    if (price >= 1000) return price.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    if (price >= 10) return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return price.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
};

const CustomChart = ({ symbol, position, currentPrice, candlesData, smaData, markers, activeTimeframe, onTimeframeChange, rsiValue, tradePlan }) => {
    const chartContainerRef = useRef(null);
    const chartRef = useRef(null);
    const candlestickSeriesRef = useRef(null);
    const smaSeriesRef = useRef(null);
    const volumeSeriesRef = useRef(null);
    const [chartReady, setChartReady] = useState(false);
    const priceLinesRef = useRef([]);

    // --- RSI COLOR LOGIC ---
    let rsiColor = "text-gray-500";
    if (rsiValue < 30) rsiColor = "text-green-400 font-bold animate-pulse";
    else if (rsiValue > 70) rsiColor = "text-red-400 font-bold animate-pulse";

    useEffect(() => {
        if (!chartContainerRef.current) return;

        const chart = createChart(chartContainerRef.current, {
            layout: { background: { color: '#0D1117' }, textColor: '#8B949E' },
            grid: { vertLines: { color: '#161B22' }, horzLines: { color: '#161B22' } },
            width: chartContainerRef.current.clientWidth,
            height: chartContainerRef.current.clientHeight,
            crosshair: { mode: CrosshairMode.Normal },
            rightPriceScale: {
                visible: true,
                borderColor: '#161B22',
                autoScale: true,
                mode: 0,
            },
            leftPriceScale: {
                visible: false,
            },
            localization: {
                timeFormatter: timestamp => {
                    const date = new Date(timestamp * 1000);
                    return date.toLocaleString(undefined, {
                        month: 'short', day: 'numeric',
                        hour: '2-digit', minute: '2-digit', hour12: false
                    });
                }
            },
            timeScale: {
                visible: true,
                timeVisible: true,
                borderColor: '#161B22',
                fixLeftEdge: true,
                fixRightEdge: true,
                tickMarkFormatter: (time, tickMarkType, locale) => {
                    const date = new Date(time * 1000);
                    switch (tickMarkType) {
                        case 0: return date.getFullYear().toString(); // Year
                        case 1: return date.toLocaleString(locale, { month: 'short' }); // Month
                        case 2: return date.getDate().toString(); // Day
                        case 3: return date.toLocaleString(locale, { hour: '2-digit', minute: '2-digit', hour12: false }); // Time
                        default: return date.toLocaleString(locale, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
                    }
                }
            },
        });

        // Dynamic price precision based on current price magnitude
        const precision = currentPrice < 0.1 ? 4 : currentPrice < 10 ? 4 : currentPrice < 1000 ? 2 : 0;
        const minMove = currentPrice < 0.1 ? 0.0001 : currentPrice < 10 ? 0.0001 : currentPrice < 1000 ? 0.01 : 1;

        const candlestickSeries = chart.addCandlestickSeries({
            upColor: '#26a69a', downColor: '#ef5350', borderVisible: false,
            wickUpColor: '#26a69a', wickDownColor: '#ef5350',
            priceFormat: {
                type: 'price',
                precision: precision,
                minMove: minMove,
            },
        });

        chartRef.current = chart;
        candlestickSeriesRef.current = candlestickSeries;
        setChartReady(true);

        const resizeObserver = new ResizeObserver(entries => {
            if (entries.length === 0) return;
            chart.applyOptions({ width: entries[0].contentRect.width, height: entries[0].contentRect.height });
        });
        resizeObserver.observe(chartContainerRef.current);

        return () => { resizeObserver.disconnect(); chart.remove(); };
    }, []);

    // --- [VISUAL INTEGRATION: CustomChart.jsx] ---
    // Summary: Renders the active Fibonacci plan onto the price action.

    useEffect(() => {
        if (!chartReady || !candlestickSeriesRef.current) return;

        // Clear previous lines
        priceLinesRef.current.forEach(line => candlestickSeriesRef.current.removePriceLine(line));
        priceLinesRef.current = [];

        if (!position || !position.fibPlan) return;

        const fib = position.fibPlan;
        const entry = parseFloat(position.entry);

        if (entry > 0) {
            // Entry line
            priceLinesRef.current.push(candlestickSeriesRef.current.createPriceLine({
                price: entry, color: '#3b82f6', lineWidth: 2, lineStyle: 0, title: 'ENTRY',
                axisLabelVisible: false
            }));

            if (fib?.tp) {
                priceLinesRef.current.push(candlestickSeriesRef.current.createPriceLine({
                    price: fib.tp, color: '#10b981', lineWidth: 2, lineStyle: 0, title: 'TP',
                    axisLabelVisible: false
                }));
            }

            if (fib?.sl) {
                priceLinesRef.current.push(candlestickSeriesRef.current.createPriceLine({
                    price: fib.sl, color: '#f43f5e', lineWidth: 1, lineStyle: 2, title: 'SL',
                    axisLabelVisible: false
                }));
            }

            if (fib?.dca1) {
                priceLinesRef.current.push(candlestickSeriesRef.current.createPriceLine({
                    price: fib.dca1, color: '#60a5fa', lineWidth: 1, lineStyle: 1, title: 'DCA1',
                    axisLabelVisible: false
                }));
            }

            if (fib?.dca2) {
                priceLinesRef.current.push(candlestickSeriesRef.current.createPriceLine({
                    price: fib.dca2, color: '#22d3ee', lineWidth: 1, lineStyle: 1, title: 'DCA2',
                    axisLabelVisible: false
                }));
            }

            if (fib?.swingHigh) {
                priceLinesRef.current.push(candlestickSeriesRef.current.createPriceLine({
                    price: fib.swingHigh, color: '#fbbf24', lineWidth: 1, lineStyle: 2, title: 'Swing H',
                    axisLabelVisible: false
                }));
            }
        }
    }, [position, chartReady]);

    // Data updates
    useEffect(() => {
        if (!candlestickSeriesRef.current || !candlesData?.length) return;
        candlestickSeriesRef.current.setData(candlesData);

        // Update last candle with live price
        if (currentPrice && currentPrice > 0) {
            const lastCandle = candlesData[candlesData.length - 1];
            candlestickSeriesRef.current.update({
                ...lastCandle,
                close: currentPrice,
                high: Math.max(lastCandle.high, currentPrice),
                low: Math.min(lastCandle.low, currentPrice)
            });
        }

        // Fit chart to content on data change
        if (chartRef.current) {
            chartRef.current.timeScale().fitContent();
        }
    }, [candlesData, chartReady]);

    // Live price tick - updates the last candle in real time
    useEffect(() => {
        if (!candlestickSeriesRef.current || !candlesData?.length || !currentPrice || currentPrice <= 0) return;
        const lastCandle = candlesData[candlesData.length - 1];
        candlestickSeriesRef.current.update({
            ...lastCandle,
            close: currentPrice,
            high: Math.max(lastCandle.high, currentPrice),
            low: Math.min(lastCandle.low, currentPrice)
        });
    }, [currentPrice]);

    return (
        <div className="w-full h-full flex flex-col bg-[#0A0E14]">
            <div className="flex items-center justify-between p-3 border-b border-gray-800">
                <div className="flex flex-col">
                    <div className="flex items-center gap-3">
                        <h3 className="text-sm font-bold text-white">{symbol}</h3>
                        <span className="text-lg font-mono font-bold text-green-400">${formatPrice(currentPrice)}</span>
                    </div>
                    {rsiValue && <span className={`text-[10px] ${rsiColor}`}>RSI: {rsiValue}</span>}
                </div>
                <div className="flex gap-1 min-w-[80px] justify-end">
                    {['1H', '4H', '1D', '1W', '1M'].map(tf => (
                        <button key={tf} onClick={() => onTimeframeChange?.(tf)}
                            className={`px-2 py-1 rounded text-[10px] ${activeTimeframe === tf ? 'bg-[#238636] text-white' : 'bg-gray-800 text-gray-400'}`}>
                            {tf}
                        </button>
                    ))}
                </div>
            </div>
            <div ref={chartContainerRef} className="flex-1 relative" />
        </div>
    );
};

export default CustomChart;
