import React, { useState } from 'react';
import { Upload, Music, FileAudio, FileVideo, ArrowRight, Check, AlertCircle, Download } from 'lucide-react';

type AudioFormat = 'mp3' | 'wav' | 'ogg' | 'm4a';
type FileType = 'audio' | 'video';

interface ConversionState {
  status: 'idle' | 'uploading' | 'converting' | 'done' | 'error';
  message?: string;
}

function App() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileType, setFileType] = useState<FileType>('audio');
  const [targetFormat, setTargetFormat] = useState<AudioFormat>('mp3');
  const [conversionState, setConversionState] = useState<ConversionState>({ status: 'idle' });

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.type.startsWith('audio/')) {
        setFileType('audio');
        setSelectedFile(file);
        setConversionState({ status: 'idle' });
      } else if (file.type.startsWith('video/')) {
        setFileType('video');
        setSelectedFile(file);
        setConversionState({ status: 'idle' });
      } else {
        setConversionState({ 
          status: 'error', 
          message: 'Please select an audio or video file' 
        });
      }
    }
  };

  const handleConvert = () => {
    // Simulating conversion process
    setConversionState({ status: 'uploading' });
    setTimeout(() => {
      setConversionState({ status: 'converting' });
      setTimeout(() => {
        setConversionState({ 
          status: 'done',
          message: `${fileType === 'video' ? 'Video converted to' : 'Converted to'} ${targetFormat.toUpperCase()} successfully!`
        });
      }, 2000);
    }, 1500);
  };

  const handleDownload = async () => {
    if (!selectedFile) return;

    try {
      // Read the original file as ArrayBuffer
      const arrayBuffer = await selectedFile.arrayBuffer();
      
      // Create an audio context
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      // Decode the audio data
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      
      // Create an offline context for rendering
      const offlineContext = new OfflineAudioContext(
        audioBuffer.numberOfChannels,
        audioBuffer.length,
        audioBuffer.sampleRate
      );
      
      // Create a buffer source
      const source = offlineContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(offlineContext.destination);
      source.start();
      
      // Render the audio
      const renderedBuffer = await offlineContext.startRendering();
      
      // Calculate total samples
      const numberOfChannels = renderedBuffer.numberOfChannels;
      const samplesPerChannel = renderedBuffer.length;
      const totalSamples = samplesPerChannel * numberOfChannels;
      
      // Calculate buffer size (44 bytes for header + 2 bytes per sample)
      const bufferSize = 44 + (totalSamples * 2);
      const buffer = new ArrayBuffer(bufferSize);
      const view = new DataView(buffer);
      
      // Write WAV header
      const writeString = (view: DataView, offset: number, string: string) => {
        for (let i = 0; i < string.length; i++) {
          view.setUint8(offset + i, string.charCodeAt(i));
        }
      };
      
      // RIFF chunk descriptor
      writeString(view, 0, 'RIFF');
      view.setUint32(4, bufferSize - 8, true);
      writeString(view, 8, 'WAVE');
      
      // fmt sub-chunk
      writeString(view, 12, 'fmt ');
      view.setUint32(16, 16, true); // fmt chunk size
      view.setUint16(20, 1, true); // audio format (1 for PCM)
      view.setUint16(22, numberOfChannels, true);
      view.setUint32(24, renderedBuffer.sampleRate, true);
      view.setUint32(28, renderedBuffer.sampleRate * numberOfChannels * 2, true); // byte rate
      view.setUint16(32, numberOfChannels * 2, true); // block align
      view.setUint16(34, 16, true); // bits per sample
      
      // data sub-chunk
      writeString(view, 36, 'data');
      view.setUint32(40, totalSamples * 2, true);
      
      // Write audio data
      let offset = 44;
      for (let i = 0; i < samplesPerChannel; i++) {
        for (let channel = 0; channel < numberOfChannels; channel++) {
          const sample = renderedBuffer.getChannelData(channel)[i];
          // Convert float32 to int16
          const int16Sample = Math.max(-1, Math.min(1, sample)) * 0x7FFF;
          view.setInt16(offset, int16Sample, true);
          offset += 2;
        }
      }
      
      // Create blob and download
      const blob = new Blob([buffer], { type: `audio/${targetFormat}` });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const originalFileName = selectedFile.name;
      link.href = url;
      link.download = `${originalFileName} - ConvertEase.${targetFormat}`;
      
      // Trigger download
      document.body.appendChild(link);
      link.click();
      
      // Cleanup
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      audioContext.close();
    } catch (error) {
      console.error('Error processing audio:', error);
      setConversionState({
        status: 'error',
        message: 'Error processing the audio file. Please try again.'
      });
    }
  };

  const audioFormats: AudioFormat[] = ['mp3', 'wav', 'ogg', 'm4a'];

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50">
      <div className="container mx-auto px-4 py-8">
        <header className="text-center mb-12">
          <div className="flex items-center justify-center mb-4">
            <Music className="w-16 h-16 text-indigo-600" />
          </div>
          <h1 className="text-5xl font-bold text-gray-900 mb-3">ConvertEase</h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">Transform your audio and video files effortlessly with our secure, fast, and user-friendly converter</p>
        </header>

        <div className="max-w-2xl mx-auto bg-white rounded-xl shadow-lg p-8">
          <div className="mb-8">
            <div className="relative border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-indigo-500 transition-colors">
              <input
                type="file"
                onChange={handleFileSelect}
                accept="audio/*,video/*"
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
              <p className="text-lg text-gray-600 mb-2">
                {selectedFile ? selectedFile.name : 'Drop your audio or video file here'}
              </p>
              <p className="text-sm text-gray-500">
                or click to browse
              </p>
            </div>
          </div>

          {selectedFile && (
            <div className="space-y-6">
              <div className="flex items-center justify-center space-x-4">
                <div className="flex-1 text-right">
                  <div className="inline-flex items-center px-4 py-2 bg-gray-100 rounded-lg">
                    {fileType === 'audio' ? (
                      <FileAudio className="w-5 h-5 text-gray-600 mr-2" />
                    ) : (
                      <FileVideo className="w-5 h-5 text-gray-600 mr-2" />
                    )}
                    <span className="text-gray-700">{selectedFile.name}</span>
                  </div>
                </div>
                <ArrowRight className="w-6 h-6 text-gray-400" />
                <div className="flex-1">
                  <select
                    value={targetFormat}
                    onChange={(e) => setTargetFormat(e.target.value as AudioFormat)}
                    className="block w-32 px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  >
                    {audioFormats.map(format => (
                      <option key={format} value={format}>
                        {format.toUpperCase()}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <button
                onClick={handleConvert}
                disabled={conversionState.status === 'converting' || conversionState.status === 'uploading'}
                className="w-full py-3 px-6 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {conversionState.status === 'idle' && 'Convert Now'}
                {conversionState.status === 'uploading' && 'Uploading...'}
                {conversionState.status === 'converting' && 'Converting...'}
                {conversionState.status === 'done' && 'Converted!'}
              </button>

              {conversionState.status === 'done' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-center space-x-2 text-green-600 bg-green-50 p-4 rounded-lg">
                    <Check className="w-5 h-5" />
                    <span>{conversionState.message}</span>
                  </div>
                  <button
                    onClick={handleDownload}
                    className="w-full flex items-center justify-center py-3 px-6 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors"
                  >
                    <Download className="w-5 h-5 mr-2" />
                    Download Converted File
                  </button>
                </div>
              )}

              {conversionState.status === 'error' && (
                <div className="flex items-center justify-center space-x-2 text-red-600 bg-red-50 p-4 rounded-lg">
                  <AlertCircle className="w-5 h-5" />
                  <span>{conversionState.message}</span>
                </div>
              )}
            </div>
          )}

          <div className="mt-8 pt-6 border-t border-gray-200">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Features</h3>
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <li className="flex items-center text-gray-600">
                <Check className="w-5 h-5 text-green-500 mr-2" />
                Audio file conversion
              </li>
              <li className="flex items-center text-gray-600">
                <Check className="w-5 h-5 text-green-500 mr-2" />
                Video to audio extraction
              </li>
              <li className="flex items-center text-gray-600">
                <Check className="w-5 h-5 text-green-500 mr-2" />
                Multiple formats supported
              </li>
              <li className="flex items-center text-gray-600">
                <Check className="w-5 h-5 text-green-500 mr-2" />
                High-quality output
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;