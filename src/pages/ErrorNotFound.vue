<template>
  <div class="fullscreen bg-grey-1 text-center q-pa-md flex flex-center">
    <div>
      <div class="text-h2 text-weight-bold text-primary">404</div>
      <div class="text-subtitle1 text-grey-7 q-mb-lg">找不到此頁面</div>
      <q-btn unelevated no-caps color="primary" icon="home" label="回到班表" :to="{ name: 'schedule' }" />
    </div>
  </div>
</template>
