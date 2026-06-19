<template>
  <div id="app">
    <TheNavbar v-model="view" />

    <div class="main-container">
      <div v-if="view === 'home'" class="home-view">
        <h1>Make Big Digs into City of Boston datasets</h1>
        <p class="subtitle">
          Welcome to <a href="https://bostondata.info">BostonData.info</a>!<br>
          
          Public records provided by the City of Boston at
          <a href="https://data.boston.gov" target="_blank"><b>data.boston.gov</b></a> are
          available to this application immediately upon publishing, and the most recent 
          items are shown first by default. Some sets of data are archives and do not 
          have records within recent years. The City provides all information under the 
          Open Data Commons Public Domain Dedication and License (PDDL).
        </p>

        <div class="developer-section">
          <div class="developer-card">
            <div class="developer-bio">
              <img
                src="https://avatars.githubusercontent.com/u/32644679?s=400&u=2f837bf05341ea68ae205a9aba576793c87e477a&v=4"
                alt="Toni Noble"
                class="developer-photo"
              >
              <h2>Built by Toni Noble</h2>
              <p>
                <b>Software Engineer & Certified Wellness Professional</b><br>
                Founder of Toni Tone & Sto Lat | NASM-CPT, CNC, CWC
              </p>
            </div>
            <p class="developer-email">
              <a href="mailto:toni@tonitoned.com">toni@tonitoned.com</a>
            </p>
            <div class="button-group-home">
              <a href="https://linkedin.com/in/tonistark" target="_blank" class="link-btn linkedin">LinkedIn</a>
              <a href="https://github.com/dethmasque" target="_blank" class="link-btn github">GitHub</a>
              <a href="https://www.paypal.com/donate/?hosted_button_id=J8N8PPM9QZTGS" target="_blank" class="link-btn donate">Support this project</a>
            </div>
          </div>

          <div class="developer-card features-card">
            <div class="brace-layout">
              <span class="the-brace">{</span>
              <div class="features-content">
                <small>
                  <b>This website is in active development.</b>
                  <br><br>
                  Please submit feature requests and bug reports to <span class="developer-email"><a href="mailto:support@tonitone.zendesk.com">our support e-mail</a></span>.
                  <br><br>
                  <b>June 10th, 2026 Release:</b><br>
                  • Dark Mode toggle now available in footer. <br>
                  • Entertainment Licenses (annual, special, and one-time) can now be explored 
                    from Licenses & Permits > Entertainment Licenses.<br>  
                  • Sharing and saving queries is now possible with URL parameters populating 
                    search filters. <br> 
                  • Location Map now displays pins for all locations within the first
                    page of results. <br>
                  • Records are now sorted in descending order by default, starting with 
                    the most recent date, if available.<br>
                  • Additional record details available for Food Inspections and Building
                    Permits. <br>
                  • Annual fiscal data comparison reports can now be generated from Fiscal 
                    & Admin > Annual Reports. <br>
                  • Improved record labeling in mobile view. <br><br> 
                  <details><summary>Previous Releases</summary><br>
                  <b>May 5th, 2026 Release:</b><br>
                  • Addressed server errors when proxied Boston CKAN API requests take longer
                    than expected<br>
                  • Fixed issue with SQL type cast triggering the Boston CKAN API's Cloudflare
                    protections<br>
                  • Monetary data filters now allow for dollar sign ($)<br>
                  • Large total values no longer overflow their containers at certain window widths<br>
                  • Filter fields and buttons do not overlap at certain window widths<br>
                  • 2025 Employee Earnings data now available
                  </details><br>
                  <i>Some upcoming features:</i><br>
                  • In-app education on how to search and filter, as well as terminology used.<br>
                  • Crime data for years 2015 through 2022.<br> 
                  • Customizable data visualizations and reports.<br>
                  <br><br>
                </small>
              </div>
            </div>
          </div>
        </div>
      </div>

      <AnnualReportsView  v-if="view === 'annual-reports'" />
      <UtilityBillsView v-if="view === 'utili-see'" />
      <LobbyingView     v-if="view === 'lobbying'" />
      <EarningsView     v-if="view === 'earnings'" />
      <SpendingView     v-if="view === 'spending'" />
      <CrimeView        v-if="view === 'crime'" />
      <FireView         v-if="view === 'fire'" />
      <ThreeOneOneView  v-if="view === 'threeoneone'" />
      <PoliceStopsView  v-if="view === 'stops'" />
      <BuildingPermitsView    v-if="view === 'permits'" />
      <FoodInspectionsView    v-if="view === 'food'" />
      <CodeViolationsView     v-if="view === 'violations'" />
      <CannabisFacilitiesView v-if="view === 'cannabis'" />
      <EntertainmentLicensesView v-if="view === 'entertainment'" />
    </div>

    <TheFooter />
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import TheFooter from './components/TheFooter.vue'
import TheNavbar from './components/TheNavbar.vue'
import AnnualReportsView from './views/AnnualReportsView.vue'
import BuildingPermitsView from './views/BuildingPermitsView.vue'
import CannabisFacilitiesView from './views/CannabisFacilitiesView.vue'
import CodeViolationsView from './views/CodeViolationsView.vue'
import CrimeView from './views/CrimeView.vue'
import EarningsView from './views/EarningsView.vue'
import EntertainmentLicensesView from './views/EntertainmentLicensesView.vue'
import FireView from './views/FireView.vue'
import FoodInspectionsView from './views/FoodInspectionsView.vue'
import LobbyingView from './views/LobbyingView.vue'
import PoliceStopsView from './views/PoliceStopsView.vue'
import SpendingView from './views/SpendingView.vue'
import ThreeOneOneView from './views/ThreeOneOneView.vue'
import UtilityBillsView from './views/UtilityBillsView.vue'

const view = ref('home')

onMounted(() => {
  try {
    const [navEntry] = performance.getEntriesByType('navigation')
    if (navEntry?.type === 'reload') {
      Object.keys(localStorage)
        .filter(k => k.startsWith('boston-filter-'))
        .forEach(k => localStorage.removeItem(k))
    }
  } catch (e) {}

  const hashStr = window.location.hash.replace('#', '')
  const viewName = hashStr.split('?')[0]
  const validViews = ['home', 'annual-reports', 'utili-see', 'lobbying', 'earnings', 'spending', 'crime', 'fire', 'threeoneone', 'snow', 'stops', 'permits', 'food', 'violations', 'cannabis', 'entertainment']
  if (validViews.includes(viewName)) {
    view.value = viewName
  }
})
</script>
