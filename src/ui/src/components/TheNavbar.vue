<template>
  <nav class="navbar" style="z-index: 2000;" ref="navbarRef">
    <div class="nav-content">
      <div class="nav-brand" @click="navigate('home')" style="cursor: pointer;">
        BostonData.info
        <small>beta!</small>
      </div>

      <button class="hamburger" @click.stop="toggleMenu" :class="{ active: menuOpen }">
        <span></span>
        <span></span>
        <span></span>
      </button>

      <div class="nav-links" :class="{ open: menuOpen }">
        <button @click="navigate('home')" :class="{ active: modelValue === 'home' }">Home</button>

        <div class="nav-section">
          <button class="nav-section-header" @click.stop="toggleSection('fiscal')">
            <span class="chevron">{{ expandedSections.fiscal ? '▼' : '▶' }}</span>
            Fiscal & Admin
          </button>
          <div v-show="expandedSections.fiscal" class="nav-section-items">
            <button @click="navigate('annual-reports')" :class="{ active: modelValue === 'annual-reports' }">Annual Reports</button>
            <button @click="navigate('earnings')" :class="{ active: modelValue === 'earnings' }">Earnings</button>
            <button @click="navigate('spending')" :class="{ active: modelValue === 'spending' }">Spending</button>
            <button @click="navigate('lobbying')" :class="{ active: modelValue === 'lobbying' }">Lobbying</button>
            <button @click="navigate('utili-see')" :class="{ active: modelValue === 'utili-see' }">Utili-see</button>
          </div>
        </div>

        <div class="nav-section">
          <button class="nav-section-header" @click.stop="toggleSection('safety')">
            <span class="chevron">{{ expandedSections.safety ? '▼' : '▶' }}</span>
            Public Safety
          </button>
          <div v-show="expandedSections.safety" class="nav-section-items">
            <button @click="navigate('food')" :class="{ active: modelValue === 'food' }">Food Inspections</button>
            <button @click="navigate('violations')" :class="{ active: modelValue === 'violations' }">Code Violations</button>
            <button @click="navigate('crime')" :class="{ active: modelValue === 'crime' }">Crime Reports</button>
            <button @click="navigate('fire')" :class="{ active: modelValue === 'fire' }">Fire Incidents</button>
            <button @click="navigate('stops')" :class="{ active: modelValue === 'stops' }">Police Stops</button>
          </div>
        </div>

        <div class="nav-section">
          <button class="nav-section-header" @click.stop="toggleSection('services')">
            <span class="chevron">{{ expandedSections.services ? '▼' : '▶' }}</span>
            Services
          </button>
          <div v-show="expandedSections.services" class="nav-section-items">
            <button @click="navigate('threeoneone')" :class="{ active: modelValue === 'threeoneone' }">311 Requests</button>
          </div>
        </div>

        <div class="nav-section">
          <button class="nav-section-header" @click.stop="toggleSection('permits')">
            <span class="chevron">{{ expandedSections.permits ? '▼' : '▶' }}</span>
            Licenses & Permits
          </button>
          <div v-show="expandedSections.permits" class="nav-section-items">
            <button @click="navigate('permits')" :class="{ active: modelValue === 'permits' }">Building Permits</button>
            <button @click="navigate('cannabis')" :class="{ active: modelValue === 'cannabis' }">Cannabis Licensing</button>
            <button @click="navigate('entertainment')" :class="{ active: modelValue === 'entertainment' }">Entertainment Licenses</button>
          </div>
        </div>
      </div>
    </div>
  </nav>
</template>

<script setup>
import { onMounted, onUnmounted, ref } from 'vue'

const props = defineProps({
  modelValue: { type: String, required: true }
})
const emit = defineEmits(['update:modelValue'])

const menuOpen = ref(false)
const navbarRef = ref(null)
const expandedSections = ref({
  services: false,
  permits: false,
  safety: false,
  fiscal: false
})

const navigate = (view) => {
  emit('update:modelValue', view)
  window.location.hash = view
  menuOpen.value = false
  collapseAllSections()
}

const toggleMenu = () => {
  menuOpen.value = !menuOpen.value
}

const toggleSection = (section) => {
  const isCurrentlyOpen = expandedSections.value[section]
  if (window.innerWidth > 1024) {
    Object.keys(expandedSections.value).forEach(key => {
      expandedSections.value[key] = false
    })
    if (!isCurrentlyOpen) {
      expandedSections.value[section] = true
    }
  } else {
    expandedSections.value[section] = !isCurrentlyOpen
  }
}

const collapseAllSections = () => {
  Object.keys(expandedSections.value).forEach(key => {
    expandedSections.value[key] = false
  })
}

const handleOutsideClick = (event) => {
  if (navbarRef.value && !navbarRef.value.contains(event.target)) {
    collapseAllSections()
  }
}

onMounted(() => document.addEventListener('click', handleOutsideClick))
onUnmounted(() => document.removeEventListener('click', handleOutsideClick))
</script>
