require('dotenv').config();

const OMXPlayer = require('omxplayer');
const consola = require('consola');
const globby = require('globby');
const Cycled = require('cycled');
const pigpio = require('pigpio');
const delay = require('delay');

const { Gpio } = pigpio;

function logError(error) {
  if (!error) {
    return;
  }

  consola.error(error);
}

async function main() {
  consola.info('Setting up GPIO');
  pigpio.configureSocketPort(8889);

  const resetButton = new Gpio(23, {
    mode: Gpio.INPUT,
    pullUpDown: Gpio.PUD_UP,
    alert: true,
  });
  resetButton.glitchFilter(100000);

  const motionSensor = new Gpio(24, {
    mode: Gpio.INPUT,
    edge: Gpio.EITHER_EDGE,
  });

  const videoGlob = process.env.VIDEO_GLOB;
  const videoFiles = await globby(videoGlob);

  if (videoFiles.length === 0) {
    consola.info("No video's found. Stopping.");
    process.exit(1);
    return;
  }

  consola.info(`${videoFiles.length} video(s) found:`);
  consola.info(videoFiles);

  const cycled = new Cycled(videoFiles);

  consola.info('Starting video player');
  const player = new OMXPlayer({
    log: consola.log,
    error: consola.error,
    blank: true,
  });
  await delay(4000);

  function startVideo(path) {
    consola.info(`Starting video ${path}`);

    player.start(path, (error) => {
      if (error) {
        consola.error(error);
        return;
      }

      const motion = motionSensor.digitalRead();

      if (!motion) {
        consola.info('Immediately pausing video because no motion is detected');
        player.pause(logError);
      }
    });
  }

  player.on('stopped', () => {
    consola.info('Video stopped, starting next video');
    startVideo(cycled.next());
  });

  resetButton.on('alert', (state) => {
    if (state === false) {
      return;
    }

    consola.info('Reset button pressed, starting next video');
    player.stop(logError);
  });

  motionSensor.on('interrupt', (motion) => {
    if (motion) {
      consola.info('Unpausing video because motion is detected');
      player._dbusInvoke('org.mpris.MediaPlayer2.Player', 'Play', null, null, logError);
    } else {
      consola.info('Pausing video because no motion is detected anymore');
      player.pause(logError);
    }
  });

  startVideo(cycled.current());
}

main();
