require('dotenv').config();

const OMXPlayer = require('omxplayer');
const consola = require('consola');
const globby = require('globby');
const Cycled = require('cycled');
const pigpio = require('pigpio');

const { Gpio } = pigpio;

async function main() {
  consola.info('Setting up GPIO');
  pigpio.configureSocketPort(8889);

  const resetButton = new Gpio(23, {
    mode: Gpio.INPUT,
    pullUpDown: Gpio.PUD_UP,
    alert: true,
  });
  resetButton.glitchFilter(50000);

  const motionSensor = new Gpio(24, {
    mode: Gpio.INPUT,
    edge: Gpio.EITHER_EDGE,
  });

  const videoGlob = process.env.VIDEO_GLOB;
  const videoFiles = await globby(videoGlob);
  consola.info(`${videoFiles.length} video(s) found:`);
  consola.info(videoFiles);

  const cycled = new Cycled(videoFiles);

  consola.info('Starting video player');
  const player = new OMXPlayer({
    log: consola.log,
    error: consola.error,
    blank: true,
  });

  function startVideo(path) {
    consola.info(`Starting video ${path}`);

    player.start(path, () => {
      const motion = motionSensor.digitalRead();

      if (!motion) {
        consola.info('Immediately pausing video because no motion is detected');
        player.pause();
      }
    });
  }

  startVideo(cycled.current());

  player.on('stopped', () => {
    consola.info('Video stopped, starting next video');
    startVideo(cycled.next());
  });

  resetButton.on('alert', (state) => {
    if (state === false) {
      return;
    }

    consola.info('Reset button pressed, starting next video');
    player.stop();
  });

  motionSensor.on('interrupt', (motion) => {
    if (motion) {
      consola.info('Unpausing video because motion is detected');
      player.playPause();
    } else {
      consola.info('Pausing video because no motion is detected anymore');
      player.pause();
    }
  });
}

main();
