// US Sales Map Component - Tron Style
// Uses React.createElement to work without JSX transpilation

function USSalesMap({ data = [] }) {
    const React = window.React;
    if (!React) {
        console.error('React is not loaded');
        return React.createElement('div', { style: { color: '#dc3545', padding: '20px' } }, 'React is not loaded');
    }

    // react-simple-maps UMD build - it's a factory function that needs React
    let ReactSimpleMaps = window.ReactSimpleMaps;
    
    // If not found, try calling the factory function
    if (!ReactSimpleMaps && window.reactSimpleMaps && typeof window.reactSimpleMaps === 'function') {
        try {
            ReactSimpleMaps = window.reactSimpleMaps(React);
            console.log('✅ Called reactSimpleMaps factory in component');
        } catch (e) {
            console.error('❌ Error calling reactSimpleMaps factory in component:', e);
        }
    }
    
    // Try alternative locations
    if (!ReactSimpleMaps) {
        ReactSimpleMaps = window.ReactSimpleMapsComponent || 
                         window['react-simple-maps'] || 
                         window.reactSimpleMaps;
    }
    
    // If still not found, log debug info
    if (!ReactSimpleMaps) {
        console.error('react-simple-maps not found in component. Available window properties:', 
            Object.keys(window).filter(k => 
                k.toLowerCase().includes('react') || 
                k.toLowerCase().includes('map') ||
                k.toLowerCase().includes('simple')
            ));
        return React.createElement('div', { style: { color: '#dc3545', padding: '20px' } }, 
            'react-simple-maps is not loaded. Check browser console for details.');
    }

    // Extract components - handle different export formats
    let ComposableMap, Geographies, Geography;
    
    // Try direct access
    if (ReactSimpleMaps.ComposableMap) {
        ComposableMap = ReactSimpleMaps.ComposableMap;
        Geographies = ReactSimpleMaps.Geographies;
        Geography = ReactSimpleMaps.Geography;
    } 
    // Try default export
    else if (ReactSimpleMaps.default) {
        ComposableMap = ReactSimpleMaps.default.ComposableMap;
        Geographies = ReactSimpleMaps.default.Geographies;
        Geography = ReactSimpleMaps.default.Geography;
    }
    // Try if it's the component itself (unlikely but possible)
    else if (typeof ReactSimpleMaps === 'function') {
        // This might be a single component, not the library
        console.error('react-simple-maps appears to be a function, not an object with components');
        return React.createElement('div', { style: { color: '#dc3545', padding: '20px' } }, 
            'react-simple-maps format not recognized. Check console.');
    }

    if (!ComposableMap || !Geographies || !Geography) {
        console.error('Map components not found. ReactSimpleMaps structure:', ReactSimpleMaps);
        console.error('Available keys:', Object.keys(ReactSimpleMaps || {}));
        return React.createElement('div', { style: { color: '#dc3545', padding: '20px' } }, 
            'Map components (ComposableMap, Geographies, Geography) are not available. Check console.');
    }

    // d3-scale UMD build exposes on window.d3.scale or window.d3Scale
    const d3Scale = (window.d3 && window.d3.scale) || window.d3Scale || {};
    const scaleQuantile = d3Scale.scaleQuantile;

    if (!scaleQuantile) {
        console.error('d3-scale.scaleQuantile not found. window.d3:', window.d3, 'window.d3Scale:', window.d3Scale);
        return React.createElement('div', { style: { color: '#dc3545', padding: '20px' } }, 
            'd3-scale is not loaded. Check console for details.');
    }

    // Data Processing Logic (The "Smart" Part)
    // Note: We can't use hooks in a regular function, so we'll process data directly
    const processData = (() => {
        if (!data || !Array.isArray(data) || data.length === 0) {
            return { stateDataMap: {}, colorScale: null, hasData: false };
        }

        // Get results array (handle both array and object formats)
        let resultsArray = [];
        let stateColumnKey = null;
        
        if (Array.isArray(data)) {
            resultsArray = data;
        } else if (data && data.results && Array.isArray(data.results)) {
            resultsArray = data.results;
            stateColumnKey = data.stateColumnKey;
        } else {
            return { stateDataMap: {}, colorScale: null, hasData: false };
        }

        if (resultsArray.length === 0) {
            return { stateDataMap: {}, colorScale: null, hasData: false };
        }

        const firstRow = resultsArray[0];
        const keys = Object.keys(firstRow);

        // Identify the State Key: Look for keys like 'state', 'region', 'province' (case-insensitive)
        if (!stateColumnKey) {
            stateColumnKey = keys.find(k => {
                const lowerKey = k.toLowerCase();
                return lowerKey === 'state' || 
                       lowerKey === 'region' || 
                       lowerKey === 'province';
            });
        }

        if (!stateColumnKey) {
            return { stateDataMap: {}, colorScale: null, hasData: false };
        }

        // Identify the Value Key: Look for the first numeric key
        const valueKey = keys.find(k => {
            if (k === stateColumnKey) return false;
            const val = firstRow[k];
            return typeof val === 'number' || (!isNaN(parseFloat(val)) && isFinite(val));
        });

        if (!valueKey) {
            return { stateDataMap: {}, colorScale: null, hasData: false };
        }

        // Create a standard object map: { "New York": 5000, "California": 12000, ... }
        const stateDataMap = {};
        resultsArray.forEach(row => {
            const stateName = String(row[stateColumnKey]).trim();
            const value = parseFloat(row[valueKey]) || 0;
            // Sum values if same state appears multiple times
            if (stateDataMap[stateName]) {
                stateDataMap[stateName] += value;
            } else {
                stateDataMap[stateName] = value;
            }
        });

        // Get all numeric values for color scale
        const values = Object.values(stateDataMap).filter(v => !isNaN(v) && isFinite(v));
        
        if (values.length === 0) {
            return { stateDataMap, colorScale: null, hasData: false };
        }

        // Color Scale Logic: Use scaleQuantile from d3-scale
        // Range (The Tron Gradient): Dark Slate -> Deep Blue -> Bright Neon Cyan
        const colorScale = scaleQuantile()
            .domain(values)
            .range([
                '#1e293b', // Dark Slate
                '#155e75', // Deep Blue
                '#0891b2', // Medium Blue
                '#06b6d4', // Cyan
                '#22d3ee', // Bright Cyan
                '#67e8f9'  // Neon Cyan
            ]);

        return { stateDataMap, colorScale, hasData: true };
    })();

    const { stateDataMap, colorScale, hasData } = processData;

    // Function to get color for a state
    const getStateColor = (stateName) => {
        if (!hasData || !stateDataMap[stateName]) {
            return '#1e293b'; // Default dark slate
        }
        if (colorScale) {
            return colorScale(stateDataMap[stateName]);
        }
        return '#1e293b';
    };

    // Function to get state value
    const getStateValue = (stateName) => {
        return stateDataMap[stateName] || null;
    };

    // Normalize state names (handle variations)
    const normalizeStateName = (geoName) => {
        const name = geoName.toLowerCase();
        // Map common variations
        const stateMap = {
            'alabama': 'Alabama', 'alaska': 'Alaska', 'arizona': 'Arizona', 'arkansas': 'Arkansas',
            'california': 'California', 'colorado': 'Colorado', 'connecticut': 'Connecticut',
            'delaware': 'Delaware', 'florida': 'Florida', 'georgia': 'Georgia', 'hawaii': 'Hawaii',
            'idaho': 'Idaho', 'illinois': 'Illinois', 'indiana': 'Indiana', 'iowa': 'Iowa',
            'kansas': 'Kansas', 'kentucky': 'Kentucky', 'louisiana': 'Louisiana', 'maine': 'Maine',
            'maryland': 'Maryland', 'massachusetts': 'Massachusetts', 'michigan': 'Michigan',
            'minnesota': 'Minnesota', 'mississippi': 'Mississippi', 'missouri': 'Missouri',
            'montana': 'Montana', 'nebraska': 'Nebraska', 'nevada': 'Nevada',
            'new hampshire': 'New Hampshire', 'new jersey': 'New Jersey', 'new mexico': 'New Mexico',
            'new york': 'New York', 'north carolina': 'North Carolina', 'north dakota': 'North Dakota',
            'ohio': 'Ohio', 'oklahoma': 'Oklahoma', 'oregon': 'Oregon', 'pennsylvania': 'Pennsylvania',
            'rhode island': 'Rhode Island', 'south carolina': 'South Carolina', 'south dakota': 'South Dakota',
            'tennessee': 'Tennessee', 'texas': 'Texas', 'utah': 'Utah', 'vermont': 'Vermont',
            'virginia': 'Virginia', 'washington': 'Washington', 'west virginia': 'West Virginia',
            'wisconsin': 'Wisconsin', 'wyoming': 'Wyoming'
        };

        // Try exact match first
        for (const [key, value] of Object.entries(stateMap)) {
            if (name === key || name.includes(key)) {
                return value;
            }
        }

        // Try partial match
        for (const [key, value] of Object.entries(stateMap)) {
            if (key.includes(name) || name.includes(key)) {
                return value;
            }
        }

        return geoName; // Return original if no match
    };

    // Simple hover state management without hooks (using closure)
    let hoveredStateKey = null;
    
    const handleMouseEnter = (geo) => {
        hoveredStateKey = geo.rsmKey;
        // Force re-render by updating a data attribute (simple approach)
        // In a real React component, we'd use useState, but since we're using createElement,
        // we'll handle hover via CSS and title attributes
    };

    const handleMouseLeave = () => {
        hoveredStateKey = null;
    };

    // Rendering (Tron Style)
    return React.createElement(ComposableMap, {
        projection: 'geoAlbersUsa',
        projectionConfig: {
            scale: 1000
        },
        style: {
            width: '100%',
            height: '100%'
        }
    }, [
        React.createElement(Geographies, {
            key: 'geographies',
            geography: 'https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json'
        }, (geographiesProps) => {
            // Geographies component passes props as an object with geographies array
            const geographies = geographiesProps?.geographies || [];
            
            if (!Array.isArray(geographies) || geographies.length === 0) {
                return React.createElement('div', { 
                    style: { color: '#94a3b8', padding: '20px', textAlign: 'center' } 
                }, 'Loading map data...');
            }
            
            return geographies.map(geo => {
                const stateName = geo.properties?.name || geo.properties?.NAME || 'Unknown';
                const normalizedName = normalizeStateName(stateName);
                const fillColor = getStateColor(normalizedName);
                const value = getStateValue(normalizedName);

                // Tooltip: "{State Name}: ${Value}"
                const tooltipText = value !== null && value !== undefined
                    ? `${stateName}: $${value.toLocaleString()}`
                    : `${stateName}: No data`;

                return React.createElement(Geography, {
                    key: geo.rsmKey || `geo-${stateName}`,
                    geography: geo,
                    fill: fillColor,
                    stroke: '#38bdf8', // Cyan stroke
                    strokeWidth: 0.75,
                    title: tooltipText, // Tooltip on hover
                    style: {
                        default: {
                            outline: 'none',
                            transition: 'all 0.3s ease',
                            cursor: 'pointer'
                        },
                        hover: {
                            outline: 'none',
                            fill: '#ffffff', // White flash
                            stroke: '#38bdf8',
                            strokeWidth: 2,
                            cursor: 'pointer',
                            filter: 'drop-shadow(0 0 8px #38bdf8)', // Glow effect
                            transition: 'all 0.3s ease'
                        },
                        pressed: {
                            fill: '#E42',
                            outline: 'none'
                        }
                    },
                    onMouseEnter: () => handleMouseEnter(geo),
                    onMouseLeave: handleMouseLeave
                });
            });
        })
    ]);
}

// Export for use in vanilla JS
if (typeof window !== 'undefined') {
    window.USSalesMap = USSalesMap;
}
