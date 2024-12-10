const { IO } = require("st-ethernet-ip")

const scanner = new IO.Scanner(); // Iinitalize new scanner on default port 2222

// device configuration from manufacturer.
const config = {
  configInstance: {
    assembly: 100,
    size: 4
  },
  outputInstance: {
    assembly: 101,
    size: 4
  },
  inputInstance: {
    assembly: 102,
    size: 4
  }
}

// Add a connection with (device config, rpi, ip_address)
const conn = scanner.addConnection(config, 8, '192.168.0.26')

// After first UDP packet is received
conn.on('connected', () => {
  console.log('Connected')
  console.log('input data => ', conn.inputData) // Display Input Data Buffer.
  
  console.log('output data => ', conn.outputData) // Display Output Data Buffer.
  // Create alias for bits and integers (can be named what ever you want)
  conn.addOutputBit(4, 0, 'out0') // Using outputData. Skip 4 bytes, use bit 0 and call it 'out0'
  conn.addOutputBit(4, 1, 'out1') // Skip 4 bytes, use bit 1 and call it 'out1'
  conn.addOutputInt(2, 'outputValue0') // Skip 2 bytes then use 16bit integer and call it 'value0'
  conn.addInputBit(4, 7, 'in7') // Skip 4 bytes then use bit 7 and call it 'in7'
  conn.addInputInt(2, 'inputValue0')
  // Set values to be written to devices
  conn.setValue('out0', true) 
  conn.setValue('out1', false)
  conn.setValue('value0', 1234)
  // Read values from device connection
  console.log(conn.getValue('in7'))
  console.log(conn.getValue('inputValue0'))
})

// Called when UDP packets are not receiving. (Timeout is based on rpi setting)
conn.on('disconnected', () => {
  console.log('Disconnected')
})