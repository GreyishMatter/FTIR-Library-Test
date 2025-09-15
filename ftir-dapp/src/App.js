// src/App.js
import React, { useState, useEffect } from 'react';
import Plot from 'react-plotly.js';
import { ethers } from 'ethers';
import './App.css';

function App() {
  const [plotData, setPlotData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [fileList, setFileList] = useState([]);
  const [spectra, setSpectra] = useState({});
  const [goldenData, setGoldenData] = useState(null);
  const [correlationResult, setCorrelationResult] = useState(null);
  const [chainlinkResult, setChainlinkResult] = useState(null);
  const [walletAddress, setWalletAddress] = useState(null);
  const [isWhitelisted, setIsWhitelisted] = useState(false);
  const goldenFileBucket = 'golden-file';
  const dataFilesBucket = 'raw-material-ftir';

  const contractAddress = "YOUR_CONTRACT_ADDRESS";
  const contractABI = [
    "function requestCorrelation(string memory fileName, string memory goldenData, string memory sampleData) external payable returns (bytes32)",
    "function correlationResults(string memory fileName) external view returns (bool)",
    "function correlationPercentages(string memory fileName) external view returns (uint256)",
    "function isWhitelisted(address user) external view returns (bool)",
    "function getRequestDataHash(bytes32 requestId) external view returns (bytes32)",
    "event CorrelationRequested(bytes32 indexed requestId, string fileName, address sender, bytes32 dataHash)",
    "event CorrelationFulfilled(bytes32 indexed requestId, string fileName, bool result, uint256 percentage)"
  ];

  const connectWallet = async () => {
    setLoading(true);
    try {
      if (!window.ethereum) {
        throw new Error('MetaMask not detected');
      }
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const address = await signer.getAddress();
      const contract = new ethers.Contract(contractAddress, contractABI, signer);

      const whitelisted = await contract.isWhitelisted(address);
      setWalletAddress(address);
      setIsWhitelisted(whitelisted);
    } catch (err) {
      setError(err.message);
      console.error('connectWallet error:', err);
    }
    setLoading(false);
  };

  const parseSpectrum = (spectrumObject) => {
    const data = Object.entries(spectrumObject).map(([wn, abs]) => ({
      wavenumber: Number(wn),
      absorbance: abs !== undefined ? Number(abs) : 0,
    })).sort((a, b) => b.wavenumber - a.wavenumber);
    console.log('Parsed spectrum:', data);
    return data;
  };

  const fetchSpectrumData = async () => {
    setLoading(true);
    setError(null);
    try {
      const url = `/proxy/${goldenFileBucket}/GOLDEN%20PCABS.json`;
      console.log('Fetching golden spectrum from:', url);
      const response = await fetch(url);
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Fetch failed with status ${response.status}: ${errorText}`);
      }
      const data = await response.json();

      if (!Array.isArray(data) || data.length === 0 || typeof data[0] !== 'object') {
        throw new Error('Expected an array containing an object');
      }

      const spectrum = parseSpectrum(data[0]);
      const wavenumbers = spectrum.map(d => d.wavenumber);
      const absorbance = spectrum.map(d => d.absorbance);

      const trace = {
        x: wavenumbers,
        y: absorbance,
        type: 'scatter',
        mode: 'lines',
        name: 'Original (GOLDEN PCABS)',
        line: { color: 'blue' },
      };

      setSpectra({ 'GOLDEN PCABS': spectrum });
      setGoldenData({ wavenumbers, absorbance });
      setPlotData({
        data: [trace],
        layout: {
          title: 'FTIR Spectrum Comparison',
          xaxis: { title: 'Wavenumber (cm⁻¹)', autorange: 'reversed' },
          yaxis: { title: 'Absorbance' },
          showlegend: true,
          width: 800,
          height: 500,
        },
      });
    } catch (err) {
      setError(err.message);
      console.error('fetchSpectrumData error:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchFileList = async () => {
    setLoading(true);
    try {
      const url = '/proxy/list-files';
      console.log('Fetching file list from:', url);
      const response = await fetch(url);
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to fetch file list: ${response.status} - ${errorText}`);
      }
      const files = await response.json();
      console.log('File list received:', files);
      setFileList(files);
    } catch (err) {
      setError(err.message);
      console.error('fetchFileList error:', err);
    } finally {
      setLoading(false);
    }
  };

  const overlayFileData = async (fileName) => {
    if (spectra[fileName.replace('.json', '')]) return;

    setLoading(true);
    try {
      const cleanFileName = fileName.trim().replace(/^\/+/, '');
      const url = `/proxy/${dataFilesBucket}/${cleanFileName}`;
      console.log('Fetching overlay file from:', url);
      const response = await fetch(url);
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Fetch failed for ${cleanFileName} with status ${response.status}: ${errorText}`);
      }
      const data = await response.json();

      if (!Array.isArray(data) || data.length === 0 || typeof data[0] !== 'object') {
        throw new Error(`Invalid data format in ${cleanFileName}`);
      }

      const spectrum = parseSpectrum(data[0]);
      const wavenumbers = spectrum.map(d => d.wavenumber);
      const absorbance = spectrum.map(d => d.absorbance);

      const newTrace = {
        x: wavenumbers,
        y: absorbance,
        type: 'scatter',
        mode: 'lines',
        name: cleanFileName.replace('.json', ''),
        line: { color: getRandomColor() },
      };

      setSpectra(prev => ({ ...prev, [cleanFileName.replace('.json', '')]: spectrum }));
      setPlotData(prev => ({
        ...prev,
        data: [...prev.data, newTrace],
      }));
    } catch (err) {
      setError(err.message);
      console.error('overlayFileData error:', err);
    } finally {
      setLoading(false);
    }
  };

  const interpolate = (spectrum, xNew) => {
    const x = spectrum.map(d => d.wavenumber);
    const y = spectrum.map(d => d.absorbance);
    const result = [];
    for (let i = 0; i < xNew.length; i++) {
      const target = xNew[i];
      if (target > x[0] || target < x[x.length - 1]) {
        result.push(0);
      } else {
        let j = 0;
        while (j < x.length - 1 && x[j] > target) j++;
        if (j === 0) {
          result.push(y[0]);
        } else {
          const x0 = x[j - 1], x1 = x[j];
          const y0 = y[j - 1], y1 = y[j];
          const interpolated = y0 + (target - x0) * (y1 - y0) / (x1 - x0);
          result.push(isNaN(interpolated) ? y0 : interpolated);
        }
      }
    }
    return result;
  };

  const calculateSimulatedCorrelation = async (fileName) => {
    if (!goldenData || !spectra['GOLDEN PCABS']) {
      setCorrelationResult({ file: fileName, message: 'Golden sample not loaded', color: 'black' });
      return;
    }

    setLoading(true);
    setCorrelationResult(null);

    try {
      let sampleSpectrum = spectra[fileName.replace('.json', '')];
      if (!sampleSpectrum) {
        const response = await fetch(`/proxy/${dataFilesBucket}/${fileName}`);
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Failed to fetch file: ${response.status} - ${errorText}`);
        }
        const data = await response.json();

        if (!Array.isArray(data) || data.length === 0 || typeof data[0] !== 'object') {
          throw new Error('Invalid data format');
        }

        sampleSpectrum = parseSpectrum(data[0]);
        setSpectra(prev => ({ ...prev, [fileName.replace('.json', '')]: sampleSpectrum }));
      }

      const goldenSpectrum = spectra['GOLDEN PCABS'];
      const goldenWavenumbers = goldenSpectrum.map(d => d.wavenumber);
      const sampleWavenumbers = sampleSpectrum.map(d => d.wavenumber);

      let finalGoldenAbsorbance = goldenSpectrum.map(d => d.absorbance);
      let finalSampleAbsorbance = sampleSpectrum.map(d => d.absorbance);

      const areWavenumbersEqual = goldenWavenumbers.length === sampleWavenumbers.length &&
        goldenWavenumbers.every((wn, i) => wn === sampleWavenumbers[i]);

      if (!areWavenumbersEqual) {
        const minWn = Math.max(Math.min(...goldenWavenumbers), Math.min(...sampleWavenumbers));
        const maxWn = Math.min(Math.max(...goldenWavenumbers), Math.max(...sampleWavenumbers));
        const step = 4;
        const commonWavenumbers = [];
        for (let wn = maxWn; wn >= minWn; wn -= step) {
          commonWavenumbers.push(wn);
        }

        if (commonWavenumbers.length < 2) {
          throw new Error('Insufficient overlapping wavenumbers');
        }

        finalGoldenAbsorbance = interpolate(goldenSpectrum, commonWavenumbers);
        finalSampleAbsorbance = interpolate(sampleSpectrum, commonWavenumbers);
      }

      if (finalGoldenAbsorbance.some(v => isNaN(v)) || finalSampleAbsorbance.some(v => isNaN(v))) {
        throw new Error('NaN values in absorbance arrays');
      }

      const n = finalGoldenAbsorbance.length;
      const meanGolden = finalGoldenAbsorbance.reduce((a, b) => a + b, 0) / n;
      const meanSample = finalSampleAbsorbance.reduce((a, b) => a + b, 0) / n;

      const numerator = finalGoldenAbsorbance.reduce((sum, g, i) => {
        return sum + (g - meanGolden) * (finalSampleAbsorbance[i] - meanSample);
      }, 0);

      const denomGolden = Math.sqrt(finalGoldenAbsorbance.reduce((sum, g) => {
        return sum + Math.pow(g - meanGolden, 2);
      }, 0));
      const denomSample = Math.sqrt(finalSampleAbsorbance.reduce((sum, s) => {
        return sum + Math.pow(s - meanSample, 2);
      }, 0));

      if (denomGolden === 0 || denomSample === 0 || isNaN(denomGolden) || isNaN(denomSample)) {
        setCorrelationResult({ file: fileName, message: 'Fail (No variance or NaN)', color: 'red' });
      } else {
        const correlation = numerator / (denomGolden * denomSample);
        const correlationPercent = (correlation * 100).toFixed(2);
        setCorrelationResult({
          file: fileName,
          message: correlationPercent > 95 ? 'Pass' : 'Fail',
          color: correlationPercent > 95 ? 'green' : 'red',
          value: correlationPercent
        });
      }
    } catch (err) {
      setCorrelationResult({ file: fileName, message: `Error: ${err.message}`, color: 'black' });
      console.error('Correlation error:', err);
    }
    setLoading(false);
  };

  const calculateChainlinkCorrelation = async (fileName) => {
    if (!isWhitelisted) {
      setChainlinkResult({ file: fileName, message: 'Not whitelisted', color: 'red' });
      return;
    }
    if (!goldenData || !spectra['GOLDEN PCABS']) {
      setChainlinkResult({ file: fileName, message: 'Golden sample not loaded', color: 'black' });
      return;
    }

    setLoading(true);
    setChainlinkResult(null);

    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(contractAddress, contractABI, signer);

      let sampleSpectrum = spectra[fileName.replace('.json', '')];
      if (!sampleSpectrum) {
        const response = await fetch(`/proxy/${dataFilesBucket}/${fileName}`);
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Failed to fetch file: ${response.status} - ${errorText}`);
        }
        const data = await response.json();

        if (!Array.isArray(data) || data.length === 0 || typeof data[0] !== 'object') {
          throw new Error('Invalid data format');
        }

        sampleSpectrum = parseSpectrum(data[0]);
        setSpectra(prev => ({ ...prev, [fileName.replace('.json', '')]: sampleSpectrum }));
      }

      const goldenAbsorbance = spectra['GOLDEN PCABS'].map(d => d.absorbance);
      const sampleAbsorbance = sampleSpectrum.map(d => d.absorbance);

      const tx = await contract.requestCorrelation(
        fileName,
        JSON.stringify(goldenAbsorbance),
        JSON.stringify(sampleAbsorbance),
        { value: ethers.parseEther("0.001") }
      );

      console.log('Chainlink Functions request sent:', tx.hash);
      setChainlinkResult({ file: fileName, message: 'Request sent, awaiting fulfillment...', color: 'blue', requestId: tx.hash });

      contract.on("CorrelationRequested", (requestId, eventFileName, sender, dataHash) => {
        if (eventFileName === fileName && sender === walletAddress) {
          setChainlinkResult(prev => ({ ...prev, dataHash }));
        }
      });

      contract.on("CorrelationFulfilled", (requestId, eventFileName, result, percentage) => {
        if (eventFileName === fileName) {
          const percent = Number(percentage) / 100;
          setChainlinkResult(prev => ({
            ...prev,
            message: result ? 'Pass' : 'Fail',
            color: result ? 'green' : 'red',
            value: percent.toFixed(2)
          }));
        }
      });

      await tx.wait();
    } catch (err) {
      setChainlinkResult({ file: fileName, message: `Error: ${err.message}`, color: 'black' });
      console.error('Chainlink correlation error:', err);
    }
    setLoading(false);
  };

  const resetSpectra = () => {
    setSpectra({ 'GOLDEN PCABS': spectra['GOLDEN PCABS'] });
    setPlotData(prev => ({
      ...prev,
      data: prev.data.filter(trace => trace.name === 'Original (GOLDEN PCABS)')
    }));
    setCorrelationResult(null);
    setChainlinkResult(null);
  };

  const getRandomColor = () => {
    const letters = '0123456789ABCDEF';
    let color = '#';
    for (let i = 0; i < 6; i++) {
      color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
  };

  useEffect(() => {
    fetchSpectrumData();
    fetchFileList();
  }, []);

  return (
    <div className="App">
      <h1>FTIR Spectrum Viewer</h1>
      <button onClick={connectWallet} disabled={loading}>
        {walletAddress ? `Connected: ${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}` : 'Connect Wallet'}
      </button>
      {walletAddress && (
        <p style={{ color: isWhitelisted ? 'green' : 'red' }}>
          {isWhitelisted ? 'Whitelisted' : 'Not Whitelisted'}
        </p>
      )}
      <button onClick={fetchSpectrumData} disabled={loading} style={{ marginLeft: '10px' }}>
        {loading ? 'Loading...' : 'Reload Original Spectrum'}
      </button>
      <button onClick={resetSpectra} disabled={loading} style={{ marginLeft: '10px' }}>
        Reset Overlays
      </button>
      {error && <p style={{ color: 'red' }}>Error: {error}</p>}
      {plotData ? (
        <Plot
          data={plotData.data}
          layout={plotData.layout}
          config={{ responsive: true }}
        />
      ) : (
        <p>No data loaded yet.</p>
      )}

      <h2>Files in {dataFilesBucket}</h2>
      {correlationResult && (
        <p style={{ color: correlationResult.color }}>
          Simulated Correlation for {correlationResult.file}: {correlationResult.message} ({correlationResult.value}%)
        </p>
      )}
      {chainlinkResult && (
        <div>
          <p style={{ color: chainlinkResult.color }}>
            Chainlink Correlation for {chainlinkResult.file}: {chainlinkResult.message}
            {chainlinkResult.value && ` (${chainlinkResult.value}%)`}
          </p>
          {chainlinkResult.dataHash && (
            <p>Data Hash: {chainlinkResult.dataHash}</p>
          )}
        </div>
      )}
      <table style={{ width: '50%', margin: '20px auto', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ border: '1px solid #ddd', padding: '8px' }}>File Name</th>
            <th style={{ border: '1px solid #ddd', padding: '8px' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {fileList.map(file => (
            <tr
              key={file.name}
              style={{
                cursor: 'pointer',
                backgroundColor: spectra[file.name.replace('.json', '')] ? '#e0e0e0' : 'white',
                border: '1px solid #ddd',
              }}
            >
              <td onClick={() => overlayFileData(file.name)} style={{ padding: '8px' }}>{file.name}</td>
              <td style={{ padding: '8px' }}>
                <button onClick={() => calculateSimulatedCorrelation(file.name)} disabled={loading}>
                  Simulated Correlation
                </button>
                <button
                  onClick={() => calculateChainlinkCorrelation(file.name)}
                  disabled={loading || !isWhitelisted}
                  style={{ marginLeft: '10px' }}
                >
                  Chainlink Correlation
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default App;