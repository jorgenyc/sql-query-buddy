// Simple US Map Component - Pure JavaScript/SVG
// No React dependencies - lightweight and fast
// Features: SVG map, heatmap coloring, tooltips, sorting, filtering

(function() {
    'use strict';

    // State name normalization map
    const STATE_NAME_MAP = {
        'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR',
        'california': 'CA', 'colorado': 'CO', 'connecticut': 'CT', 'delaware': 'DE',
        'district of columbia': 'DC', 'florida': 'FL', 'georgia': 'GA', 'hawaii': 'HI', 'idaho': 'ID',
        'illinois': 'IL', 'indiana': 'IN', 'iowa': 'IA', 'kansas': 'KS',
        'kentucky': 'KY', 'louisiana': 'LA', 'maine': 'ME', 'maryland': 'MD',
        'massachusetts': 'MA', 'michigan': 'MI', 'minnesota': 'MN', 'mississippi': 'MS',
        'missouri': 'MO', 'montana': 'MT', 'nebraska': 'NE', 'nevada': 'NV',
        'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
        'north carolina': 'NC', 'north dakota': 'ND', 'ohio': 'OH', 'oklahoma': 'OK',
        'oregon': 'OR', 'pennsylvania': 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
        'south dakota': 'SD', 'tennessee': 'TN', 'texas': 'TX', 'utah': 'UT',
        'vermont': 'VT', 'virginia': 'VA', 'washington': 'WA', 'west virginia': 'WV',
        'wisconsin': 'WI', 'wyoming': 'WY'
    };

    // Full state names to abbreviations
    const FULL_NAME_TO_ABBR = {
        'Alabama': 'AL', 'Alaska': 'AK', 'Arizona': 'AZ', 'Arkansas': 'AR',
        'California': 'CA', 'Colorado': 'CO', 'Connecticut': 'CT', 'Delaware': 'DE',
        'District of Columbia': 'DC', 'Florida': 'FL', 'Georgia': 'GA', 'Hawaii': 'HI', 'Idaho': 'ID',
        'Illinois': 'IL', 'Indiana': 'IN', 'Iowa': 'IA', 'Kansas': 'KS',
        'Kentucky': 'KY', 'Louisiana': 'LA', 'Maine': 'ME', 'Maryland': 'MD',
        'Massachusetts': 'MA', 'Michigan': 'MI', 'Minnesota': 'MN', 'Mississippi': 'MS',
        'Missouri': 'MO', 'Montana': 'MT', 'Nebraska': 'NE', 'Nevada': 'NV',
        'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY',
        'North Carolina': 'NC', 'North Dakota': 'ND', 'Ohio': 'OH', 'Oklahoma': 'OK',
        'Oregon': 'OR', 'Pennsylvania': 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
        'South Dakota': 'SD', 'Tennessee': 'TN', 'Texas': 'TX', 'Utah': 'UT',
        'Vermont': 'VT', 'Virginia': 'VA', 'Washington': 'WA', 'West Virginia': 'WV',
        'Wisconsin': 'WI', 'Wyoming': 'WY'
    };

    // State abbreviation to full name (for tooltips)
    const ABBR_TO_FULL_NAME = {};
    Object.entries(FULL_NAME_TO_ABBR).forEach(([full, abbr]) => {
        ABBR_TO_FULL_NAME[abbr] = full;
    });

    // Normalize state name to abbreviation
    function normalizeStateName(name) {
        if (!name) return null;
        const nameStr = String(name).trim();
        
        // Check if already an abbreviation
        if (nameStr.length === 2 && /^[A-Z]{2}$/i.test(nameStr)) {
            return nameStr.toUpperCase();
        }
        
        // Check full name map
        if (FULL_NAME_TO_ABBR[nameStr]) {
            return FULL_NAME_TO_ABBR[nameStr];
        }
        
        // Check lowercase map
        const lower = nameStr.toLowerCase();
        if (STATE_NAME_MAP[lower]) {
            return STATE_NAME_MAP[lower];
        }
        
        // Try partial match
        for (const [key, abbr] of Object.entries(STATE_NAME_MAP)) {
            if (lower.includes(key) || key.includes(lower)) {
                return abbr;
            }
        }
        
        return null;
    }

    // Color scale function (simple quantile-based)
    function createColorScale(values) {
        if (!values || values.length === 0) {
            return () => '#1e293b';
        }
        
        const sorted = [...values].sort((a, b) => a - b);
        const min = sorted[0];
        const max = sorted[sorted.length - 1];
        const range = max - min;
        
        const colors = [
            '#1e293b', // Dark Slate
            '#155e75', // Deep Blue
            '#0891b2', // Medium Blue
            '#06b6d4', // Cyan
            '#22d3ee', // Bright Cyan
            '#67e8f9'  // Neon Cyan
        ];
        
        return (value) => {
            if (range === 0) return colors[3]; // Default to cyan if all values are same
            const ratio = (value - min) / range;
            const index = Math.min(Math.floor(ratio * colors.length), colors.length - 1);
            return colors[index];
        };
    }

    // Process data from results
    function processMapData(data) {
        console.log('🗺️ processMapData called with:', { 
            dataType: typeof data, 
            isArray: Array.isArray(data),
            hasResults: data && data.results,
            dataKeys: data && typeof data === 'object' ? Object.keys(data) : []
        });

        if (!data) {
            console.warn('⚠️ No data provided');
            return { stateDataMap: {}, colorScale: null, hasData: false };
        }

        let resultsArray = [];
        let stateColumnKey = null;
        
        if (Array.isArray(data)) {
            resultsArray = data;
            console.log('✅ Data is array, length:', resultsArray.length);
        } else if (data && data.results && Array.isArray(data.results)) {
            resultsArray = data.results;
            stateColumnKey = data.stateColumnKey;
            console.log('✅ Data has results array, length:', resultsArray.length, 'stateColumnKey:', stateColumnKey);
        } else {
            console.warn('⚠️ Data format not recognized:', data);
            return { stateDataMap: {}, colorScale: null, hasData: false };
        }

        if (resultsArray.length === 0) {
            console.warn('⚠️ Results array is empty');
            return { stateDataMap: {}, colorScale: null, hasData: false };
        }

        const firstRow = resultsArray[0];
        if (!firstRow || typeof firstRow !== 'object') {
            console.warn('⚠️ First row is not an object:', firstRow);
            return { stateDataMap: {}, colorScale: null, hasData: false };
        }

        const keys = Object.keys(firstRow);
        console.log('📊 First row keys:', keys);
        console.log('📊 First row sample:', firstRow);

        // Find state column
        if (!stateColumnKey) {
            stateColumnKey = keys.find(k => {
                const lowerKey = k.toLowerCase();
                return lowerKey === 'state' || 
                       lowerKey === 'region' || 
                       lowerKey === 'province';
            });
        }

        if (!stateColumnKey) {
            console.warn('⚠️ No state/region/province column found. Available keys:', keys);
            return { stateDataMap: {}, colorScale: null, hasData: false };
        }

        console.log('✅ Found state column:', stateColumnKey);

        // Find value column
        const valueKey = keys.find(k => {
            if (k === stateColumnKey) return false;
            const val = firstRow[k];
            const isNumeric = typeof val === 'number' || (!isNaN(parseFloat(val)) && isFinite(val));
            return isNumeric;
        });

        if (!valueKey) {
            console.warn('⚠️ No numeric value column found. Available keys:', keys);
            return { stateDataMap: {}, colorScale: null, hasData: false };
        }

        console.log('✅ Found value column:', valueKey);

        // Create state data map (using abbreviations)
        const stateDataMap = {};
        let skippedCount = 0;
        resultsArray.forEach(row => {
            const stateName = String(row[stateColumnKey] || '').trim();
            if (!stateName) {
                skippedCount++;
                return;
            }
            
            const stateAbbr = normalizeStateName(stateName);
            if (!stateAbbr) {
                console.warn('⚠️ Could not normalize state name:', stateName);
                skippedCount++;
                return; // Skip if we can't normalize
            }
            
            const value = parseFloat(row[valueKey]) || 0;
            if (stateDataMap[stateAbbr]) {
                stateDataMap[stateAbbr] += value;
            } else {
                stateDataMap[stateAbbr] = value;
            }
        });

        console.log('📊 State data map:', stateDataMap);
        console.log('📊 Skipped rows:', skippedCount, 'out of', resultsArray.length);

        const values = Object.values(stateDataMap).filter(v => !isNaN(v) && isFinite(v));
        
        if (values.length === 0) {
            console.warn('⚠️ No valid state values after processing');
            return { stateDataMap, colorScale: null, hasData: false };
        }

        console.log('✅ Processed', values.length, 'states with values');
        const colorScale = createColorScale(values);
        return { stateDataMap, colorScale, hasData: true, valueKey };
    }

    // Load US states SVG paths from CDN
    async function loadUSMapSVG() {
        try {
            // Try multiple CDN sources for reliability
            const sources = [
                'https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json',
                'https://raw.githubusercontent.com/topojson/us-atlas/master/states-10m.json'
            ];
            
            for (const url of sources) {
                try {
                    const response = await fetch(url);
                    if (response.ok) {
                        const geoData = await response.json();
                        console.log('✅ Loaded map data from:', url);
                        return geoData;
                    }
                } catch (e) {
                    console.warn('⚠️ Failed to load from', url, e);
                    continue;
                }
            }
            throw new Error('All CDN sources failed');
        } catch (error) {
            console.warn('⚠️ Failed to load map from CDN, using embedded paths:', error);
            // Fallback: return null and we'll use embedded SVG paths
            return null;
        }
    }

    // Convert TopoJSON to GeoJSON and create paths
    // Note: TopoJSON needs to be converted to GeoJSON first
    function processTopoJSON(topoData) {
        // If it's already GeoJSON, return as is
        if (topoData.type === 'FeatureCollection' && topoData.features) {
            return topoData;
        }
        
        // If it's TopoJSON, we'd need topojson library to convert
        // For now, return null and use fallback
        console.warn('⚠️ TopoJSON format detected but conversion library not available');
        return null;
    }

    // Simple SVG path creation using embedded state shapes
    // This creates a simplified but functional map
    function createSimplifiedSVGMap(svg, stateDataMap, colorScale) {
        // Use a grid-based layout for states (simplified but functional)
        // This is a fallback when GeoJSON/TopoJSON loading fails
        const stateGrid = {
            // West Coast
            'WA': { x: 120, y: 80, w: 100, h: 80 },
            'OR': { x: 120, y: 160, w: 100, h: 100 },
            'CA': { x: 120, y: 260, w: 100, h: 180 },
            'NV': { x: 220, y: 240, w: 80, h: 100 },
            'ID': { x: 220, y: 120, w: 80, h: 80 },
            'UT': { x: 300, y: 200, w: 80, h: 100 },
            'AZ': { x: 220, y: 340, w: 100, h: 100 },
            'NM': { x: 320, y: 320, w: 100, h: 100 },
            'CO': { x: 380, y: 200, w: 100, h: 100 },
            'WY': { x: 380, y: 140, w: 100, h: 60 },
            'MT': { x: 320, y: 80, w: 120, h: 60 },
            'ND': { x: 420, y: 60, w: 80, h: 60 },
            'SD': { x: 420, y: 120, w: 80, h: 60 },
            'NE': { x: 420, y: 180, w: 80, h: 80 },
            'KS': { x: 420, y: 260, w: 100, h: 80 },
            'OK': { x: 420, y: 340, w: 100, h: 80 },
            'TX': { x: 420, y: 420, w: 150, h: 140 },
            // Midwest
            'MN': { x: 480, y: 80, w: 100, h: 80 },
            'IA': { x: 500, y: 180, w: 80, h: 80 },
            'MO': { x: 500, y: 260, w: 100, h: 100 },
            'AR': { x: 520, y: 340, w: 80, h: 80 },
            'LA': { x: 520, y: 420, w: 100, h: 100 },
            'MS': { x: 580, y: 380, w: 80, h: 100 },
            'AL': { x: 620, y: 360, w: 80, h: 100 },
            'TN': { x: 620, y: 280, w: 100, h: 80 },
            'KY': { x: 640, y: 240, w: 80, h: 80 },
            'IL': { x: 560, y: 200, w: 100, h: 80 },
            'IN': { x: 640, y: 200, w: 80, h: 80 },
            'OH': { x: 680, y: 200, w: 80, h: 80 },
            'MI': { x: 600, y: 120, w: 120, h: 80 },
            'WI': { x: 560, y: 120, w: 100, h: 80 },
            // East Coast
            'PA': { x: 720, y: 180, w: 100, h: 100 },
            'NY': { x: 760, y: 120, w: 100, h: 100 },
            'VT': { x: 800, y: 100, w: 60, h: 60 },
            'NH': { x: 840, y: 100, w: 60, h: 60 },
            'ME': { x: 880, y: 60, w: 80, h: 100 },
            'MA': { x: 840, y: 140, w: 80, h: 60 },
            'RI': { x: 860, y: 160, w: 40, h: 40 },
            'CT': { x: 820, y: 160, w: 60, h: 60 },
            'NJ': { x: 780, y: 180, w: 80, h: 60 },
            'DE': { x: 780, y: 240, w: 40, h: 40 },
            'MD': { x: 780, y: 280, w: 80, h: 60 },
            'DC': { x: 780, y: 340, w: 20, h: 20 },
            'WV': { x: 720, y: 260, w: 80, h: 80 },
            'VA': { x: 760, y: 280, w: 100, h: 100 },
            'NC': { x: 760, y: 380, w: 100, h: 100 },
            'SC': { x: 760, y: 480, w: 80, h: 80 },
            'GA': { x: 700, y: 420, w: 100, h: 100 },
            'FL': { x: 720, y: 520, w: 100, h: 120 },
            // Additional states
            'HI': { x: 200, y: 480, w: 60, h: 40 },
            'AK': { x: 100, y: 20, w: 120, h: 200 }
        };

        Object.entries(stateDataMap).forEach(([abbr, value]) => {
            const color = colorScale(value);
            const pos = stateGrid[abbr];
            
            if (pos) {
                const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                rect.setAttribute('x', pos.x);
                rect.setAttribute('y', pos.y);
                rect.setAttribute('width', pos.w);
                rect.setAttribute('height', pos.h);
                rect.setAttribute('rx', '4'); // Rounded corners
                rect.setAttribute('fill', color);
                rect.setAttribute('stroke', '#38bdf8');
                rect.setAttribute('stroke-width', '1');
                rect.setAttribute('data-state', abbr);
                rect.setAttribute('data-value', value);
                rect.style.cursor = 'pointer';
                rect.style.transition = 'all 0.3s ease';
                svg.appendChild(rect);

                // Add state label
                const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                text.setAttribute('x', pos.x + pos.w / 2);
                text.setAttribute('y', pos.y + pos.h / 2);
                text.setAttribute('text-anchor', 'middle');
                text.setAttribute('dominant-baseline', 'middle');
                text.setAttribute('fill', '#e2e8f0');
                text.setAttribute('font-size', Math.min(pos.w, pos.h) > 60 ? '14' : '10');
                text.setAttribute('font-weight', '600');
                text.setAttribute('pointer-events', 'none');
                text.textContent = abbr;
                svg.appendChild(text);
            }
        });
    }

    // Render SVG US Map with interactivity
    async function renderUSMap(containerId, data) {
        console.log('🗺️ renderUSMap called:', { containerId, dataType: typeof data });
        
        const container = document.getElementById(containerId);
        if (!container) {
            console.error('❌ Map container not found:', containerId);
            return;
        }

        const { stateDataMap, colorScale, hasData, valueKey } = processMapData(data);
        
        console.log('🗺️ Processing result:', { 
            hasData, 
            hasColorScale: !!colorScale, 
            stateCount: Object.keys(stateDataMap).length,
            states: Object.keys(stateDataMap)
        });
        
        if (!hasData || !colorScale) {
            console.warn('⚠️ Cannot render map - missing data or color scale');
            container.innerHTML = `
                <h3>🗺️ Geographic Data Detected</h3>
                <p style="color: #94a3b8; padding: 20px; text-align: center;">
                    Unable to process geographic data for map visualization.<br>
                    <small>Please ensure your query includes state/region names and numeric values.</small><br>
                    <small style="font-size: 0.75rem; color: #64748b;">Check browser console for debugging information.</small>
                </p>
            `;
            return;
        }

        // Create controls and map container
        const mapHTML = createMapHTML(containerId, stateDataMap, colorScale, valueKey);
        container.innerHTML = mapHTML;

        // Load and render SVG map
        setTimeout(async () => {
            await renderSVGMap(containerId, stateDataMap, colorScale);
            setupInteractivity(containerId, stateDataMap, colorScale, valueKey);
        }, 100);
    }

    // Create HTML structure with controls
    function createMapHTML(containerId, stateDataMap, colorScale, valueKey) {
        const states = Object.entries(stateDataMap)
            .map(([abbr, value]) => ({ abbr, value, name: ABBR_TO_FULL_NAME[abbr] || abbr }))
            .sort((a, b) => b.value - a.value); // Sort by value descending

        const maxValue = Math.max(...Object.values(stateDataMap));
        const minValue = Math.min(...Object.values(stateDataMap));

        return `
            <div style="display: flex; flex-direction: column; height: 100%;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; flex-wrap: wrap; gap: 10px;">
                    <h3 style="margin: 0; color: #38bdf8;">🗺️ Geographic Visualization</h3>
                    <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
                        <label style="color: #e2e8f0; font-size: 0.85rem;">
                            Sort:
                            <select id="${containerId}-sort" style="
                                background: rgba(30, 41, 59, 0.8);
                                border: 1px solid rgba(148, 163, 184, 0.3);
                                border-radius: 4px;
                                color: #e2e8f0;
                                padding: 4px 8px;
                                font-size: 0.85rem;
                                margin-left: 5px;
                            ">
                                <option value="value-desc">Value (High to Low)</option>
                                <option value="value-asc">Value (Low to High)</option>
                                <option value="name-asc">Name (A-Z)</option>
                                <option value="name-desc">Name (Z-A)</option>
                            </select>
                        </label>
                        <label style="color: #e2e8f0; font-size: 0.85rem;">
                            Filter:
                            <input type="text" id="${containerId}-filter" placeholder="Search state..." style="
                                background: rgba(30, 41, 59, 0.8);
                                border: 1px solid rgba(148, 163, 184, 0.3);
                                border-radius: 4px;
                                color: #e2e8f0;
                                padding: 4px 8px;
                                font-size: 0.85rem;
                                margin-left: 5px;
                                width: 150px;
                            ">
                        </label>
                    </div>
                </div>
                <div style="display: flex; gap: 20px; flex: 1; min-height: 0;">
                    <div style="flex: 1; position: relative; background: rgba(15, 23, 42, 0.3); border-radius: 8px; padding: 15px;">
                        <svg id="${containerId}-svg" viewBox="0 0 1000 600" style="width: 100%; height: 100%; min-height: 400px;">
                            <!-- States will be rendered here -->
                            <text x="500" y="300" text-anchor="middle" fill="#64748b" font-size="14">
                                Loading map...
                            </text>
                        </svg>
                        <div id="${containerId}-tooltip" style="
                            position: absolute;
                            background: rgba(15, 23, 42, 0.95);
                            border: 1px solid #38bdf8;
                            border-radius: 6px;
                            padding: 8px 12px;
                            color: #e2e8f0;
                            font-size: 0.85rem;
                            pointer-events: none;
                            opacity: 0;
                            transition: opacity 0.2s;
                            z-index: 1000;
                            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
                        "></div>
                    </div>
                    <div style="width: 250px; background: rgba(15, 23, 42, 0.3); border-radius: 8px; padding: 15px; overflow-y: auto; max-height: 100%;">
                        <div style="margin-bottom: 15px;">
                            <div style="color: #38bdf8; font-size: 0.9rem; font-weight: 600; margin-bottom: 8px;">Legend</div>
                            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                                <div style="width: 20px; height: 20px; background: #1e293b; border: 1px solid #38bdf8; border-radius: 2px;"></div>
                                <span style="color: #94a3b8; font-size: 0.75rem;">Low: ${formatValue(minValue)}</span>
                            </div>
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <div style="width: 20px; height: 20px; background: #67e8f9; border: 1px solid #38bdf8; border-radius: 2px;"></div>
                                <span style="color: #94a3b8; font-size: 0.75rem;">High: ${formatValue(maxValue)}</span>
                            </div>
                        </div>
                        <div style="color: #38bdf8; font-size: 0.9rem; font-weight: 600; margin-bottom: 8px;">State List</div>
                        <div id="${containerId}-state-list" style="display: flex; flex-direction: column; gap: 4px;">
                            ${states.map(state => `
                                <div class="state-list-item" 
                                     data-state="${state.abbr}"
                                     style="
                                        display: flex;
                                        justify-content: space-between;
                                        align-items: center;
                                        padding: 6px 8px;
                                        background: ${colorScale(state.value)};
                                        border: 1px solid rgba(56, 189, 248, 0.3);
                                        border-radius: 4px;
                                        cursor: pointer;
                                        transition: all 0.2s;
                                        font-size: 0.8rem;
                                    ">
                                    <span style="color: #e2e8f0; font-weight: 600;">${state.abbr}</span>
                                    <span style="color: #94a3b8;">${formatValue(state.value)}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    // Format value for display
    function formatValue(value) {
        if (typeof value === 'number') {
            return value.toLocaleString('en-US', { 
                style: 'currency', 
                currency: 'USD', 
                minimumFractionDigits: 0,
                maximumFractionDigits: 0
            });
        }
        return value;
    }

    // Render SVG map with state paths
    async function renderSVGMap(containerId, stateDataMap, colorScale) {
        const svg = document.getElementById(`${containerId}-svg`);
        if (!svg) return;

        // Clear loading text
        svg.innerHTML = '';

        // Try to load GeoJSON/TopoJSON data
        try {
            const geoData = await loadUSMapSVG();
            const processedData = processTopoJSON(geoData);
            
            if (processedData && processedData.features) {
                // Render from GeoJSON features
                processedData.features.forEach(feature => {
                    const stateName = feature.properties.name || feature.properties.NAME || feature.properties.NAME_1;
                    const stateAbbr = normalizeStateName(stateName);
                    if (!stateAbbr || !stateDataMap[stateAbbr]) return;

                    const value = stateDataMap[stateAbbr];
                    const color = colorScale(value);

                    // For GeoJSON, we need proper projection - use simplified approach
                    // Create a bounding box representation
                    const bbox = getFeatureBBox(feature);
                    if (bbox) {
                        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                        rect.setAttribute('x', bbox.x);
                        rect.setAttribute('y', bbox.y);
                        rect.setAttribute('width', bbox.width);
                        rect.setAttribute('height', bbox.height);
                        rect.setAttribute('rx', '2');
                        rect.setAttribute('fill', color);
                        rect.setAttribute('stroke', '#38bdf8');
                        rect.setAttribute('stroke-width', '1');
                        rect.setAttribute('data-state', stateAbbr);
                        rect.setAttribute('data-value', value);
                        rect.style.cursor = 'pointer';
                        rect.style.transition = 'all 0.3s ease';
                        svg.appendChild(rect);

                        // Add label
                        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                        text.setAttribute('x', bbox.x + bbox.width / 2);
                        text.setAttribute('y', bbox.y + bbox.height / 2);
                        text.setAttribute('text-anchor', 'middle');
                        text.setAttribute('dominant-baseline', 'middle');
                        text.setAttribute('fill', '#e2e8f0');
                        text.setAttribute('font-size', '12');
                        text.setAttribute('font-weight', '600');
                        text.setAttribute('pointer-events', 'none');
                        text.textContent = stateAbbr;
                        svg.appendChild(text);
                    }
                });
                console.log('✅ Rendered map from GeoJSON data');
                return;
            }
        } catch (error) {
            console.warn('⚠️ Could not load/process GeoJSON, using simplified map:', error);
        }

        // Fallback: Use simplified grid-based map
        console.log('📊 Using simplified grid-based map layout');
        createSimplifiedSVGMap(svg, stateDataMap, colorScale);
    }

    // Get bounding box from GeoJSON feature (simplified)
    function getFeatureBBox(feature) {
        // This is a very simplified approach - just return approximate positions
        // For a real implementation, you'd calculate actual bounding boxes
        const stateName = feature.properties.name || feature.properties.NAME || feature.properties.NAME_1;
        const stateAbbr = normalizeStateName(stateName);
        
        // Use the same grid as simplified map
        const stateGrid = {
            'WA': { x: 120, y: 80, w: 100, h: 80 }, 'OR': { x: 120, y: 160, w: 100, h: 100 },
            'CA': { x: 120, y: 260, w: 100, h: 180 }, 'NV': { x: 220, y: 240, w: 80, h: 100 },
            'ID': { x: 220, y: 120, w: 80, h: 80 }, 'UT': { x: 300, y: 200, w: 80, h: 100 },
            'AZ': { x: 220, y: 340, w: 100, h: 100 }, 'NM': { x: 320, y: 320, w: 100, h: 100 },
            'CO': { x: 380, y: 200, w: 100, h: 100 }, 'WY': { x: 380, y: 140, w: 100, h: 60 },
            'MT': { x: 320, y: 80, w: 120, h: 60 }, 'ND': { x: 420, y: 60, w: 80, h: 60 },
            'SD': { x: 420, y: 120, w: 80, h: 60 }, 'NE': { x: 420, y: 180, w: 80, h: 80 },
            'KS': { x: 420, y: 260, w: 100, h: 80 }, 'OK': { x: 420, y: 340, w: 100, h: 80 },
            'TX': { x: 420, y: 420, w: 150, h: 140 }, 'MN': { x: 480, y: 80, w: 100, h: 80 },
            'IA': { x: 500, y: 180, w: 80, h: 80 }, 'MO': { x: 500, y: 260, w: 100, h: 100 },
            'AR': { x: 520, y: 340, w: 80, h: 80 }, 'LA': { x: 520, y: 420, w: 100, h: 100 },
            'MS': { x: 580, y: 380, w: 80, h: 100 }, 'AL': { x: 620, y: 360, w: 80, h: 100 },
            'TN': { x: 620, y: 280, w: 100, h: 80 }, 'KY': { x: 640, y: 240, w: 80, h: 80 },
            'IL': { x: 560, y: 200, w: 100, h: 80 }, 'IN': { x: 640, y: 200, w: 80, h: 80 },
            'OH': { x: 680, y: 200, w: 80, h: 80 }, 'MI': { x: 600, y: 120, w: 120, h: 80 },
            'WI': { x: 560, y: 120, w: 100, h: 80 }, 'PA': { x: 720, y: 180, w: 100, h: 100 },
            'NY': { x: 760, y: 120, w: 100, h: 100 }, 'VT': { x: 800, y: 100, w: 60, h: 60 },
            'NH': { x: 840, y: 100, w: 60, h: 60 }, 'ME': { x: 880, y: 60, w: 80, h: 100 },
            'MA': { x: 840, y: 140, w: 80, h: 60 }, 'RI': { x: 860, y: 160, w: 40, h: 40 },
            'CT': { x: 820, y: 160, w: 60, h: 60 }, 'NJ': { x: 780, y: 180, w: 80, h: 60 },
            'DE': { x: 780, y: 240, w: 40, h: 40 }, 'MD': { x: 780, y: 280, w: 80, h: 60 },
            'DC': { x: 780, y: 340, w: 20, h: 20 }, 'WV': { x: 720, y: 260, w: 80, h: 80 },
            'VA': { x: 760, y: 280, w: 100, h: 100 }, 'NC': { x: 760, y: 380, w: 100, h: 100 },
            'SC': { x: 760, y: 480, w: 80, h: 80 }, 'GA': { x: 700, y: 420, w: 100, h: 100 },
            'FL': { x: 720, y: 520, w: 100, h: 120 }, 'HI': { x: 200, y: 480, w: 60, h: 40 },
            'AK': { x: 100, y: 20, w: 120, h: 200 }
        };
        
        return stateGrid[stateAbbr] ? {
            x: stateGrid[stateAbbr].x,
            y: stateGrid[stateAbbr].y,
            width: stateGrid[stateAbbr].w,
            height: stateGrid[stateAbbr].h
        } : null;
    }

    // Setup interactivity (tooltips, sorting, filtering)
    function setupInteractivity(containerId, stateDataMap, colorScale, valueKey) {
        const svg = document.getElementById(`${containerId}-svg`);
        const tooltip = document.getElementById(`${containerId}-tooltip`);
        const sortSelect = document.getElementById(`${containerId}-sort`);
        const filterInput = document.getElementById(`${containerId}-filter`);
        const stateList = document.getElementById(`${containerId}-state-list`);

        if (!svg || !tooltip) return;

        // Tooltip functionality
        const showTooltip = (event, stateAbbr, value) => {
            const stateName = ABBR_TO_FULL_NAME[stateAbbr] || stateAbbr;
            tooltip.innerHTML = `
                <strong style="color: #38bdf8;">${stateName}</strong><br>
                <span style="color: #94a3b8;">${formatValue(value)}</span>
            `;
            tooltip.style.opacity = '1';
            tooltip.style.left = (event.pageX - svg.getBoundingClientRect().left + 10) + 'px';
            tooltip.style.top = (event.pageY - svg.getBoundingClientRect().top - 10) + 'px';
        };

        const hideTooltip = () => {
            tooltip.style.opacity = '0';
        };

        // Add hover effects to SVG paths
        svg.querySelectorAll('[data-state]').forEach(element => {
            const stateAbbr = element.getAttribute('data-state');
            const value = parseFloat(element.getAttribute('data-value'));
            const originalColor = element.getAttribute('fill');

            element.addEventListener('mouseenter', (e) => {
                element.setAttribute('fill', '#ffffff');
                element.setAttribute('stroke-width', '2');
                element.style.filter = 'drop-shadow(0 0 8px #38bdf8)';
                showTooltip(e, stateAbbr, value);
            });

            element.addEventListener('mouseleave', () => {
                element.setAttribute('fill', originalColor);
                element.setAttribute('stroke-width', '0.5');
                element.style.filter = 'none';
                hideTooltip();
            });
        });

        // Sorting functionality
        if (sortSelect) {
            sortSelect.addEventListener('change', () => {
                updateStateList(containerId, stateDataMap, colorScale, sortSelect.value, filterInput?.value || '');
            });
        }

        // Filtering functionality
        if (filterInput) {
            filterInput.addEventListener('input', (e) => {
                updateStateList(containerId, stateDataMap, colorScale, sortSelect?.value || 'value-desc', e.target.value);
            });
        }

        // State list item hover
        if (stateList) {
            stateList.querySelectorAll('.state-list-item').forEach(item => {
                item.addEventListener('mouseenter', () => {
                    item.style.background = '#ffffff';
                    item.style.color = '#0f172a';
                    item.style.boxShadow = '0 0 10px rgba(56, 189, 248, 0.5)';
                    
                    // Highlight corresponding state on map
                    const stateAbbr = item.getAttribute('data-state');
                    const mapElement = svg.querySelector(`[data-state="${stateAbbr}"]`);
                    if (mapElement) {
                        const originalColor = mapElement.getAttribute('fill');
                        mapElement.setAttribute('fill', '#ffffff');
                        mapElement.setAttribute('stroke-width', '2');
                        mapElement.style.filter = 'drop-shadow(0 0 8px #38bdf8)';
                    }
                });

                item.addEventListener('mouseleave', () => {
                    const stateAbbr = item.getAttribute('data-state');
                    const value = stateDataMap[stateAbbr];
                    item.style.background = colorScale(value);
                    item.style.color = '';
                    item.style.boxShadow = 'none';
                    
                    // Reset map element
                    const mapElement = svg.querySelector(`[data-state="${stateAbbr}"]`);
                    if (mapElement) {
                        mapElement.setAttribute('fill', colorScale(value));
                        mapElement.setAttribute('stroke-width', '0.5');
                        mapElement.style.filter = 'none';
                    }
                });
            });
        }
    }

    // Update state list based on sort and filter
    function updateStateList(containerId, stateDataMap, colorScale, sortBy, filterText) {
        const stateList = document.getElementById(`${containerId}-state-list`);
        if (!stateList) return;

        let states = Object.entries(stateDataMap)
            .map(([abbr, value]) => ({ abbr, value, name: ABBR_TO_FULL_NAME[abbr] || abbr }))
            .filter(state => {
                if (!filterText) return true;
                const search = filterText.toLowerCase();
                return state.abbr.toLowerCase().includes(search) || 
                       state.name.toLowerCase().includes(search);
            });

        // Sort
        switch (sortBy) {
            case 'value-desc':
                states.sort((a, b) => b.value - a.value);
                break;
            case 'value-asc':
                states.sort((a, b) => a.value - b.value);
                break;
            case 'name-asc':
                states.sort((a, b) => a.name.localeCompare(b.name));
                break;
            case 'name-desc':
                states.sort((a, b) => b.name.localeCompare(a.name));
                break;
        }

        stateList.innerHTML = states.map(state => `
            <div class="state-list-item" 
                 data-state="${state.abbr}"
                 style="
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 6px 8px;
                    background: ${colorScale(state.value)};
                    border: 1px solid rgba(56, 189, 248, 0.3);
                    border-radius: 4px;
                    cursor: pointer;
                    transition: all 0.2s;
                    font-size: 0.8rem;
                ">
                <span style="color: #e2e8f0; font-weight: 600;">${state.abbr}</span>
                <span style="color: #94a3b8;">${formatValue(state.value)}</span>
            </div>
        `).join('');

        // Re-attach event listeners
        const svg = document.getElementById(`${containerId}-svg`);
        stateList.querySelectorAll('.state-list-item').forEach(item => {
            item.addEventListener('mouseenter', () => {
                item.style.background = '#ffffff';
                item.style.color = '#0f172a';
                item.style.boxShadow = '0 0 10px rgba(56, 189, 248, 0.5)';
                
                const stateAbbr = item.getAttribute('data-state');
                const mapElement = svg?.querySelector(`[data-state="${stateAbbr}"]`);
                if (mapElement) {
                    const originalColor = mapElement.getAttribute('fill');
                    mapElement.setAttribute('fill', '#ffffff');
                    mapElement.setAttribute('stroke-width', '2');
                    mapElement.style.filter = 'drop-shadow(0 0 8px #38bdf8)';
                }
            });

            item.addEventListener('mouseleave', () => {
                const stateAbbr = item.getAttribute('data-state');
                const value = stateDataMap[stateAbbr];
                item.style.background = colorScale(value);
                item.style.color = '';
                item.style.boxShadow = 'none';
                
                const mapElement = svg?.querySelector(`[data-state="${stateAbbr}"]`);
                if (mapElement) {
                    mapElement.setAttribute('fill', colorScale(value));
                    mapElement.setAttribute('stroke-width', '0.5');
                    mapElement.style.filter = 'none';
                }
            });
        });
    }

    // Export functions
    window.SimpleUSMap = {
        render: renderUSMap,
        processData: processMapData,
        normalizeStateName: normalizeStateName
    };

    console.log('✅ SimpleUSMap loaded successfully');
})();
