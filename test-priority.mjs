#!/usr/bin/env node

// Test ICE candidate priority calculation
// According to RFC 5245, priority = (2^24)*(type preference) + (2^8)*(local preference) + (2^0)*(256 - component ID)

const TYPE_PREFERENCE = {
    host: 126,     // Typically 126
    srflx: 100,    // Typically 100  
    relay: 0       // Typically 0
};

function calculatePriority(type, localPref = 65535, componentId = 1) {
    const typePref = TYPE_PREFERENCE[type];
    return (Math.pow(2, 24) * typePref) + (Math.pow(2, 8) * localPref) + (256 - componentId);
}

console.log('ICE Candidate Priority Calculation\n');

// Calculate for each type
console.log('Standard priorities:');
console.log('Host:  ', calculatePriority('host'), '=', calculatePriority('host').toString(16), '(hex)');
console.log('Srflx: ', calculatePriority('srflx'), '=', calculatePriority('srflx').toString(16), '(hex)');
console.log('Relay: ', calculatePriority('relay'), '=', calculatePriority('relay').toString(16), '(hex)');

// Check the values we're seeing
console.log('\nValues from logs:');
console.log('Browser srflx: 1685855999 =', (1685855999).toString(16), '(hex)');
console.log('Our srflx:     1686052607 =', (1686052607).toString(16), '(hex)');
console.log('Host priority: 2122260223 =', (2122260223).toString(16), '(hex)');

// Reverse engineer the browser's priority
const browserPriority = 1685855999;
const typePortion = Math.floor(browserPriority / Math.pow(2, 24));
const remainder = browserPriority % Math.pow(2, 24);
const localPortion = Math.floor(remainder / Math.pow(2, 8));
const componentPortion = remainder % Math.pow(2, 8);

console.log('\nBrowser priority breakdown:');
console.log('Type preference:', typePortion);
console.log('Local preference:', localPortion);
console.log('Component portion:', componentPortion, '=> component ID:', 256 - componentPortion);

// The priority we're using seems wrong
console.log('\nOur hardcoded priorities:');
console.log('Host:  2122260223 - Expected:', calculatePriority('host'));
console.log('Srflx: 1686052607 - Expected:', calculatePriority('srflx'));
console.log('Relay: 41885439   - Expected:', calculatePriority('relay'));

// Check if the issue is the srflx priority
const correctSrflxPriority = calculatePriority('srflx');
console.log('\nCorrect srflx priority should be:', correctSrflxPriority);

// Let's also check line endings
console.log('\n=== Testing line endings ===');
const testSDP = `a=candidate:1 1 udp ${correctSrflxPriority} 24.17.60.171 50000 typ srflx raddr 192.168.1.7 rport 50000 generation 0`;
console.log('Test line length:', testSDP.length);
console.log('Test line:', testSDP);