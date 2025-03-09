// @ts-check


window.addEventListener('load', async function () {
  if (!('serviceWorker' in navigator)) {
    alert('This app reqire service workers');
    throw new Error('Service workers are required for this app');
  }

  const registration = await navigator.serviceWorker.register('/webapp/service-worker.js');

  registration.addEventListener('updatefound', async function (event) {
    console.info('A new service worker has been found');
  });

  navigator.serviceWorker.addEventListener('message', async function (event) {

  });

});
