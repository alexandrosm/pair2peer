// Simple CRC-16 implementation for error detection
export function calculateCRC16(data) {
    const polynomial = 0x1021; // CRC-16-CCITT polynomial
    let crc = 0xFFFF; // Initial value
    
    for (let i = 0; i < data.length; i++) {
        crc ^= (data[i] << 8);
        
        for (let j = 0; j < 8; j++) {
            if (crc & 0x8000) {
                crc = (crc << 1) ^ polynomial;
            } else {
                crc = crc << 1;
            }
        }
    }
    
    return crc & 0xFFFF;
}

export function addCRC(data) {
    // Calculate CRC for the data
    const crc = calculateCRC16(data);
    
    // Create new array with CRC appended
    const result = new Uint8Array(data.length + 2);
    result.set(data);
    result[data.length] = (crc >> 8) & 0xFF; // High byte
    result[data.length + 1] = crc & 0xFF;     // Low byte
    
    return result;
}

export function verifyCRC(dataWithCRC) {
    if (dataWithCRC.length < 2) {
        throw new Error('Data too short to contain CRC');
    }
    
    // Extract data and CRC
    const data = dataWithCRC.slice(0, -2);
    const receivedCRC = (dataWithCRC[dataWithCRC.length - 2] << 8) | dataWithCRC[dataWithCRC.length - 1];
    
    // Calculate CRC for the data
    const calculatedCRC = calculateCRC16(data);
    
    if (calculatedCRC !== receivedCRC) {
        console.error(`CRC mismatch! Received: ${receivedCRC.toString(16)}, Calculated: ${calculatedCRC.toString(16)}`);
        return { valid: false, data: null };
    }
    
    return { valid: true, data: data };
}