/**
 * Получение потока захвата экрана
 * @param {string} ID потока экрана
 * @param {number} Ширина захватываемого видео
 * @param {number} Высота захватываемого видео
 * @returns {MediaStream} Поток захвата экрана
 */
export const getStream = async (screenStreamId, width = 1280, height = 720) => {
  return await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      mandatory: {
        chromeMediaSource: 'desktop',
        chromeMediaSourceId: screenStreamId,
        maxWidth: width,
        maxHeight: height
      }
    }
  });
};

/**
 * Создание продюсера для показа экрана
 * @returns {Promise}
 */
export const createProducer = async (room, msTransport, screenStreamId, simulcastOptions = false) => {
  console.error('before getStream');
  const stream = await getStream(screenStreamId);
  console.error('after getStream');

  const track = stream.getVideoTracks()[0];
  const producer = room.createProducer(
    track,
    { simulcast: simulcastOptions },
    { source: 'screen' }
  );

  console.error('before send');
  await producer.send(msTransport);
  console.error('after send');
  return producer;
}
