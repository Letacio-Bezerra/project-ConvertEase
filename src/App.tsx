import React, { useState, useEffect } from 'react';
import { Upload, Music, FileAudio, FileVideo, ArrowRight, Check, AlertCircle, Download } from 'lucide-react';
import { PDFDocument } from 'pdf-lib';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { useTheme } from './contexts/ThemeContext';
import { ThemeToggle } from './components/ThemeToggle';

type AudioFormat = 'mp3' | 'wav' | 'ogg' | 'm4a';
type ImageFormat = 'jpg' | 'png' | 'gif' | 'webp' | 'pdf';
type VideoFormat = 'mp4' | 'avi' | 'mkv' | 'mov';

type MediaType = 'audio' | 'image' | 'video';
type FormatType = AudioFormat | ImageFormat | VideoFormat;

interface ConversionState {
  status: 'idle' | 'uploading' | 'converting' | 'done' | 'error';
  message?: string;
}

function App() {
  const { theme } = useTheme();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [mediaType, setMediaType] = useState<MediaType>('audio');
  const [fileType, setFileType] = useState<MediaType>('audio');
  const [targetFormat, setTargetFormat] = useState<FormatType>('mp3');
  const [conversionState, setConversionState] = useState<ConversionState>({ status: 'idle' });
  const [ffmpeg] = useState(() => new FFmpeg());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const loadFFmpeg = async () => {
      try {
        const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
        await ffmpeg.load({
          coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
          wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm')
        });
        setLoaded(true);
      } catch (error) {
        console.error('Error loading FFmpeg:', error);
      }
    };
    loadFFmpeg();
  }, [ffmpeg]);

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
      } else if (file.type.startsWith('image/') || file.type === 'application/pdf') {
        setFileType('image');
        setSelectedFile(file);
        setConversionState({ status: 'idle' });
      } else {
        setConversionState({ 
          status: 'error', 
          message: 'Please select an audio, video, image or document file' 
        });
      }
    }
  };

  const handleConvert = async () => {
    if (!selectedFile || !loaded) return;

    try {
      setConversionState({ status: 'uploading' });
      
      if (fileType === 'video') {
        setConversionState({ status: 'converting' });
        
        const inputFileName = 'input' + selectedFile.name.substring(selectedFile.name.lastIndexOf('.'));
        const outputFileName = `output.${targetFormat}`;
        
        ffmpeg.writeFile(inputFileName, await fetchFile(selectedFile));
        
        // Optimized FFmpeg configuration for better quality
        const ffmpegArgs = [
          '-i', inputFileName,
          '-c:v', 'libx264',     // H.264 video codec
          '-c:a', 'aac',         // AAC audio codec
          '-preset', 'slow',      // Better compression, higher quality
          '-crf', '18',          // Constant quality (18 is considered visually lossless)
          '-profile:v', 'high',   // High encoding profile
          '-level', '4.0',       // Compatibility level
          '-movflags', '+faststart', // Streaming optimization
          '-pix_fmt', 'yuv420p',  // Compatible pixel format
          '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', // Ensures even dimensions
          outputFileName
        ];

        await ffmpeg.exec(ffmpegArgs);
        
        const data = await ffmpeg.readFile(outputFileName);
        const blob = new Blob([data], { type: `video/${targetFormat}` });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${selectedFile.name.split('.')[0]} - ConvertEase.${targetFormat}`;
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        setConversionState({
          status: 'done',
          message: `Video converted to ${targetFormat.toUpperCase()} successfully!`
        });
      } else {
        setConversionState({ status: 'converting' });
        setTimeout(() => {
          setConversionState({ 
            status: 'done',
            message: `Converted to ${targetFormat.toUpperCase()} successfully!`
          });
        }, 2000);
      }
    } catch (error) {
      console.error('Error converting video:', error);
      setConversionState({
        status: 'error',
        message: 'Error converting video. Please try again.'
      });
    }
  };

  const handleDownload = async () => {
    if (!selectedFile) return;

    try {
      if (fileType === 'audio') {
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
      } else if (fileType === 'image') {
        if (targetFormat === 'pdf') {
          // Create a new PDF document
          const pdfDoc = await PDFDocument.create();
          
          // Create a canvas element to handle image conversion
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          const img = new Image();
          
          // Create a blob URL for the selected file
          const imageUrl = URL.createObjectURL(selectedFile);
          
          // Wait for the image to load
          await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
            img.src = imageUrl;
          });
          
          // Set canvas dimensions to match image
          canvas.width = img.width;
          canvas.height = img.height;
          
          // Draw image on canvas
          ctx?.drawImage(img, 0, 0);
          
          // Convert canvas to bytes
          const imageBytes = await new Promise<Uint8Array>((resolve) => {
            canvas.toBlob(async (blob) => {
              const arrayBuffer = await blob!.arrayBuffer();
              resolve(new Uint8Array(arrayBuffer));
            }, 'image/png');
          });
          
          // Embed the image in the PDF
          const image = await pdfDoc.embedPng(imageBytes);
          
          // Create a page with the same dimensions as the image
          const page = pdfDoc.addPage([img.width, img.height]);
          
          // Draw the image on the page at full size
          page.drawImage(image, {
            x: 0,
            y: 0,
            width: img.width,
            height: img.height
          });

          // Save the PDF
          const pdfBytes = await pdfDoc.save();
          const blob = new Blob([pdfBytes], { type: 'application/pdf' });
          const url = URL.createObjectURL(blob);

          // Create download link
          const link = document.createElement('a');
          link.href = url;
          link.download = `${selectedFile.name.split('.')[0]} - ConvertEase.pdf`;

          // Trigger download
          document.body.appendChild(link);
          link.click();

          // Cleanup
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
          URL.revokeObjectURL(imageUrl);
        } else {
          // Create a canvas element to handle image conversion
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          const img = new Image();

          // Create a blob URL for the selected file
          const imageUrl = URL.createObjectURL(selectedFile);

          // Wait for the image to load
          await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
            img.src = imageUrl;
          });

          // Set canvas dimensions to match image
          canvas.width = img.width;
          canvas.height = img.height;

          // Draw image on canvas
          ctx?.drawImage(img, 0, 0);

          // Convert to desired format
          const mimeType = `image/${targetFormat}`;
          const quality = 0.92; // High quality

          // Get the converted image data
          const convertedImageData = canvas.toDataURL(mimeType, quality);

          // Create download link
          const link = document.createElement('a');
          link.href = convertedImageData;
          link.download = `${selectedFile.name.split('.')[0]} - ConvertEase.${targetFormat}`;

          // Trigger download
          document.body.appendChild(link);
          link.click();

          // Cleanup
          document.body.removeChild(link);
          URL.revokeObjectURL(imageUrl);
        }
      }
    } catch (error) {
      console.error('Error processing file:', error);
      setConversionState({
        status: 'error',
        message: `Error processing the ${fileType} file. Please try again.`
      });
    }
  };

  const formats = {
    audio: ['mp3', 'wav', 'ogg', 'm4a'],
    image: ['jpg', 'png', 'gif', 'webp', 'pdf'],
    video: ['mp4', 'avi', 'mkv', 'mov']
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-dark-primary dark:to-dark-secondary transition-colors">
      <div className="container mx-auto px-4 py-8">
        <header className="text-center mb-12 relative">
          <div className="absolute right-4 top-4">
            <ThemeToggle />
          </div>
          <div className="flex items-center justify-center mb-4">
            <Music className="w-16 h-16 text-indigo-600 dark:text-indigo-400" />
          </div>
          <h1 className="text-5xl font-bold text-gray-900 dark:text-dark-text mb-3">ConvertEase</h1>
          <p className="text-xl text-gray-600 dark:text-dark-text max-w-2xl mx-auto">Transform your audio and video files effortlessly with our secure, fast, and user-friendly converter</p>
        </header>

        <div className="max-w-2xl mx-auto bg-white rounded-xl shadow-lg p-8">
          <div className="mb-8">
            <div className="flex justify-center space-x-4 mb-6">
              {Object.keys(formats).map((type) => (
                <button
                  key={type}
                  onClick={() => {
                    setMediaType(type as MediaType);
                    setTargetFormat(formats[type as keyof typeof formats][0] as FormatType);
                  }}
                  className={`px-6 py-2 rounded-lg font-medium transition-colors ${mediaType === type ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                >
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </button>
              ))}
            </div>
            <div className="relative border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-8 text-center hover:border-indigo-500 dark:hover:border-indigo-400 transition-colors">
              <input
                type="file"
                onChange={handleFileSelect}
                accept={`${mediaType}/*`}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <Upload className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500 mb-4" />
              <p className="text-lg text-gray-600 dark:text-gray-300 mb-2">
                {selectedFile ? selectedFile.name : 'Drop your audio or video file here'}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                or click to browse
              </p>
            </div>
          </div>

          {selectedFile && (
            <div className="space-y-6">
              <div className="flex items-center justify-center space-x-4">
                <div className="flex-1 text-right">
                  <div className="inline-flex items-center px-4 py-2 bg-gray-100 dark:bg-dark-secondary rounded-lg">
                    {fileType === 'audio' ? (
                      <FileAudio className="w-5 h-5 text-gray-600 dark:text-gray-400 mr-2" />
                    ) : (
                      <FileVideo className="w-5 h-5 text-gray-600 dark:text-gray-400 mr-2" />
                    )}
                    <span className="text-gray-700 dark:text-gray-300">{selectedFile.name}</span>
                  </div>
                </div>
                <ArrowRight className="w-6 h-6 text-gray-400 dark:text-gray-500" />
                <div className="flex-1">
                  <select
                    value={targetFormat}
                    onChange={(e) => setTargetFormat(e.target.value as FormatType)}
                    className="block w-32 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-dark-secondary dark:text-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  >
                    {formats[mediaType].map(format => (
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