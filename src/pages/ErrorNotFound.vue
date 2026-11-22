<template>
  <div class="fullscreen bg-page text-center q-pa-md flex flex-center">
    <div>
      <h1 class="page-title">找不到此頁面</h1>
      <p class="text-body1 text-muted q-mt-sm q-mb-lg">連結可能已失效，或網址有誤。</p>
      <q-btn unelevated no-caps color="primary" label="回到班表" :to="{ name: 'schedule' }" />
    </div>
  </div>
</template>
