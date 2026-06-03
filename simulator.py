import time
import math
import random
import sys

# Try importing requests for API communications
try:
    import requests
except ImportError:
    print("Error: The 'requests' library is required to run the simulator.")
    print("Please install it using: pip install requests")
    sys.exit(1)

# Try importing real Adafruit ADS1115 libraries to check for hardware deployment
import importlib
HAS_HARDWARE = False
try:
    # Use dynamic import to suppress static linter warnings on Windows/PC environments
    Adafruit_ADS1x15 = importlib.import_module("Adafruit_ADS1x15")
    adc = Adafruit_ADS1x15.ADS1115()
    GAIN = 1  # Range: +/- 4.096V
    HAS_HARDWARE = True
    print("\033[92m[HARDWARE] ADS1115 ADC Detected! Running in LIVE hardware acquisition mode.\033[0m")
except (ImportError, ModuleNotFoundError):
    print("\033[93m[SIMULATION] ADS1115 ADC hardware not detected. Running in high-fidelity simulation mode.\033[0m")

# Target Backend Server Configurations
API_URL = "http://localhost:5000/api/readings"

def read_telemetry(step):
    """
    Acquires data from actual ADS1115 channels if hardware is present,
    otherwise generates realistic simulated signals with noise and anomalies.
    """
    if HAS_HARDWARE:
        # Hardware Channel Mapping:
        # A0 = DC Voltage (via resistor divider)
        # A1 = Current (ACS712 sensor)
        # A2 = Temperature (LM35 temperature sensor)
        # A3 = AC Voltage (ZMPT101B AC voltage sensor)
        
        try:
            # 1. DC Voltage calculation
            # Resistor divider 10k/1k (attenuates up to 40V to max 4V for ADC input)
            dc_raw = adc.read_adc(0, gain=GAIN)
            dc_volts = (dc_raw / 32767.0) * 4.096
            dc_voltage = dc_volts * 11.0 # Scale back to original
            
            # 2. Current calculation
            # ACS712 has 66mV/A sensitivity centered at 2.5V (offset)
            current_raw = adc.read_adc(1, gain=GAIN)
            current_volts = (current_raw / 32767.0) * 4.096
            current = abs(current_volts - 2.5) / 0.066
            
            # 3. Temperature calculation
            # LM35 has 10mV/C output
            temp_raw = adc.read_adc(2, gain=GAIN)
            temp_volts = (temp_raw / 32767.0) * 4.096
            temperature = temp_volts * 100.0 # 10mV per degree
            
            # 4. AC Voltage calculation
            # High frequency sampling of ZMPT101B output to compute RMS
            # We sample for 20ms (one full 50Hz cycle)
            start_time = time.time()
            samples = []
            while (time.time() - start_time) < 0.02:
                ac_raw = adc.read_adc(3, gain=GAIN)
                ac_volts = (ac_raw / 32767.0) * 4.096
                samples.append(ac_volts)
            
            # Compute Root Mean Square (RMS)
            mean_sq = sum(v ** 2 for v in samples) / len(samples)
            rms_volts = math.sqrt(mean_sq)
            ac_voltage = rms_volts * 100.0 # Voltage transformer calibration factor
            
            # Add small noise filter correction
            ac_voltage = max(0.0, ac_voltage)
            dc_voltage = max(0.0, dc_voltage)
            current = max(0.0, current)
            
            status = "PASS"
            # Flag anomalous bounds
            if ac_voltage < 215 or ac_voltage > 245 or temperature > 50 or current > 3.5:
                status = "FAIL"
                
            return ac_voltage, dc_voltage, current, temperature, status
            
        except Exception as hardware_err:
            print(f"\033[91m[HARDWARE ERROR] Failed reading ADC: {hardware_err}. Falling back to simulation...\033[0m")

    # --- SIMULATION FALLBACK ---
    # Generate continuous, realistic curves with mathematical wave structures
    
    # 1. AC Voltage - 230V standard RMS utility supply with 50Hz fluctuations
    # Cycles up and down with low-frequency drift + high frequency jitter
    ac_drift = 4.0 * math.sin(step / 30.0)
    ac_noise = random.uniform(-0.8, 0.8)
    ac_voltage = 230.0 + ac_drift + ac_noise
    
    # 2. DC Voltage - Regulated 5V or 12V bus (we alternate or drift slightly)
    # Most PCBs have a 5V logic line. We'll model a steady 5.02V rail with tiny noise.
    dc_noise = random.uniform(-0.02, 0.02)
    dc_voltage = 5.05 + dc_noise
    
    # 3. Current - Around 1.8A load with small spikes representing CPU bursts
    curr_noise = random.uniform(-0.05, 0.05)
    current = 1.65 + (0.5 * math.sin(step / 10.0)) + curr_noise
    
    # 4. Temperature - Gradually increases from ambient 27C to 42C under load, then fluctuates
    temp_rise = min(15.0, step * 0.3)  # Climbs up over the first 50 iterations
    temp_noise = random.uniform(-0.2, 0.2)
    temperature = 28.0 + temp_rise + (1.2 * math.cos(step / 15.0)) + temp_noise
    
    # 5. Anomaly Injector (for demo purposes)
    # 3% chance of generating a brief industrial voltage dip/surge or temperature spike
    status = "PASS"
    anomaly_trigger = random.random()
    if anomaly_trigger < 0.015:
        # AC dip anomaly
        ac_voltage = 195.4
        status = "FAIL"
        print("\033[91m[ANOMALY INJECTED] AC Under-Voltage Dip!\033[0m")
    elif anomaly_trigger > 0.985:
        # Thermal thermal overload anomaly
        temperature = 58.2
        status = "FAIL"
        print("\033[91m[ANOMALY INJECTED] Component Thermal Overload!\033[0m")
        
    return ac_voltage, dc_voltage, current, temperature, status

def main():
    print("=" * 60)
    print("  SMART PCB METER - INDUSTRIAL TELEMETRY SIMULATOR")
    print(f"  Target Server: {API_URL}")
    print("  Press Ctrl+C to terminate simulator.")
    print("=" * 60)
    
    step = 0
    consecutive_errors = 0
    
    while True:
        try:
            ac_voltage, dc_voltage, current, temperature, status = read_telemetry(step)
            
            # Prepare API Payload
            payload = {
                "ac_voltage": round(ac_voltage, 2),
                "dc_voltage": round(dc_voltage, 3),
                "current": round(current, 3),
                "temperature": round(temperature, 2),
                "status": status
            }
            
            # Send HTTP POST to server
            response = requests.post(API_URL, json=payload, timeout=2.0)
            
            if response.status_code == 201:
                # Color code status outputs
                stat_color = "\033[92mPASS\033[0m" if status == "PASS" else "\033[91mFAIL\033[0m"
                print(f"[TX #{step:04d}] AC: {ac_voltage:.1f}V | DC: {dc_voltage:.2f}V | I: {current:.3f}A | T: {temperature:.1f}°C | Status: {stat_color} | HTTP 201")
                consecutive_errors = 0
            else:
                print(f"\033[93m[API Warning] Received code {response.status_code}: {response.text}\033[0m")
                
            step += 1
            
        except requests.exceptions.ConnectionError:
            consecutive_errors += 1
            print(f"\033[91m[Connection Error] Server offline (Retrying in 2s... #{consecutive_errors})\033[0m")
        except Exception as e:
            print(f"\033[91m[Error] Unexpected exception: {e}\033[0m")
            
        # Poll every 2 seconds
        time.sleep(2.0)

if __name__ == "__main__":
    main()
