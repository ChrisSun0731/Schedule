<template>
  <div class="fullscreen bg-page text-center q-pa-md flex flex-center">
    <div>
      <div class="text-h2 text-weight-bold text-primary">404</div>
      <div class="text-subtitle1 text-muted q-mb-lg">找不到此頁面，連結可能已失效。</div>
      <q-btn unelevated no-caps color="primary" icon="home" label="回到班表" :to="{ name: 'schedule' }" />
    </div>
  </div>
</template>
