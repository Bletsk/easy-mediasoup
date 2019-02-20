import Logger from '../Logger';

const setScreenShare = (streamId) => {
  logger.debug("setScreenShare()");
  this._screenStreamId = streamId;
  if(!this._screenShareProducer) this._activateScreenShare();
  else this._changeScreenForShare();
}

/**
 * Получение потока захвата экрана
 * @param {string} ID потока экрана
 * @param {number} Ширина захватываемого видео
 * @param {number} Высота захватываемого видео
 * @returns {MediaStream} Поток захвата экрана
 */
export const getScreenCaptureStream = (screenStreamId, width = 1280, height = 720) => {
  return navigator.mediaDevices.getUserMedia({
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
