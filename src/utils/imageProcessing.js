const UPSCALE_FACTOR = 2.5
const MIN_ROW_INTENSITY = 0.15

export function cloneCanvas(source) {
  const canvas = document.createElement('canvas')
  canvas.width = source.width
  canvas.height = source.height
  const ctx = canvas.getContext('2d')
  ctx.drawImage(source, 0, 0)
  return canvas
}

export async function createCanvasFromSource(source) {
  if (source instanceof HTMLCanvasElement) {
    return cloneCanvas(source)
  }

  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0)
      resolve(canvas)
    }
    img.onerror = reject
    img.src = source
  })
}

export function upscaleCanvas(canvas, factor = UPSCALE_FACTOR) {
  const output = document.createElement('canvas')
  output.width = Math.floor(canvas.width * factor)
  output.height = Math.floor(canvas.height * factor)
  const ctx = output.getContext('2d')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(canvas, 0, 0, output.width, output.height)
  return output
}

function computeHistogram(data) {
  const histogram = new Array(256).fill(0)
  for (let i = 0; i < data.length; i += 4) {
    histogram[data[i]] += 1
  }
  return histogram
}

function otsuThreshold(histogram, total) {
  let sum = 0
  for (let t = 0; t < 256; t++) {
    sum += t * histogram[t]
  }

  let sumB = 0
  let weightB = 0
  let weightF = 0
  let maxVariance = 0
  let threshold = 127

  for (let t = 0; t < 256; t++) {
    weightB += histogram[t]
    if (weightB === 0) continue
    weightF = total - weightB
    if (weightF === 0) break

    sumB += t * histogram[t]
    const meanB = sumB / weightB
    const meanF = (sum - sumB) / weightF
    const variance = weightB * weightF * (meanB - meanF) * (meanB - meanF)

    if (variance > maxVariance) {
      maxVariance = variance
      threshold = t
    }
  }

  return threshold
}

function applyThreshold(canvas, threshold) {
  const ctx = canvas.getContext('2d')
  const { width, height } = canvas
  const image = ctx.getImageData(0, 0, width, height)
  const data = image.data

  for (let i = 0; i < data.length; i += 4) {
    const value = data[i]
    const bin = value > threshold ? 255 : 0
    data[i] = bin
    data[i + 1] = bin
    data[i + 2] = bin
  }

  ctx.putImageData(image, 0, 0)
  return canvas
}

function toGray(canvas) {
  const ctx = canvas.getContext('2d')
  const { width, height } = canvas
  const image = ctx.getImageData(0, 0, width, height)
  const { data } = image

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    const gray = Math.round(r * 0.299 + g * 0.587 + b * 0.114)
    data[i] = gray
    data[i + 1] = gray
    data[i + 2] = gray
  }

  ctx.putImageData(image, 0, 0)
  return canvas
}

function enhanceContrast(canvas) {
  const ctx = canvas.getContext('2d')
  const { width, height } = canvas
  const image = ctx.getImageData(0, 0, width, height)
  const { data } = image

  let min = 255
  let max = 0

  for (let i = 0; i < data.length; i += 4) {
    const value = data[i]
    if (value < min) min = value
    if (value > max) max = value
  }

  const spread = max - min || 1
  for (let i = 0; i < data.length; i += 4) {
    const normalized = (data[i] - min) / spread
    const gamma = 0.8
    const adjusted = Math.pow(normalized, gamma)
    const equalized = Math.min(255, Math.max(0, Math.round(adjusted * 255)))
    data[i] = equalized
    data[i + 1] = equalized
    data[i + 2] = equalized
  }

  ctx.putImageData(image, 0, 0)
  return canvas
}

function cropVerticalByDensity(canvas) {
  const ctx = canvas.getContext('2d')
  const { width, height } = canvas
  const image = ctx.getImageData(0, 0, width, height)
  const { data } = image

  const density = new Array(height).fill(0)
  for (let y = 0; y < height; y++) {
    let darkPixels = 0
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4
      if (data[idx] < 180) darkPixels += 1
    }
    density[y] = darkPixels / width
  }

  let top = 0
  let bottom = height - 1

  const threshold = Math.max(MIN_ROW_INTENSITY, density.reduce((acc, value) => acc + value, 0) / height)

  while (top < bottom && density[top] < threshold) top += 1
  while (bottom > top && density[bottom] < threshold) bottom -= 1

  const cropHeight = Math.max(bottom - top, Math.floor(height * 0.25))
  const output = document.createElement('canvas')
  output.width = width
  output.height = cropHeight
  const outputCtx = output.getContext('2d')
  outputCtx.drawImage(canvas, 0, top, width, cropHeight, 0, 0, width, cropHeight)
  return output
}

export function preprocessCanvas(initial) {
  let canvas = cloneCanvas(initial)
  canvas = upscaleCanvas(canvas)
  canvas = toGray(canvas)
  canvas = enhanceContrast(canvas)

  const ctx = canvas.getContext('2d')
  const { width, height } = canvas
  const image = ctx.getImageData(0, 0, width, height)
  const histogram = computeHistogram(image.data)
  const totalPixels = width * height
  const threshold = otsuThreshold(histogram, totalPixels)

  canvas = applyThreshold(canvas, threshold)
  canvas = cropVerticalByDensity(canvas)
  return canvas
}


