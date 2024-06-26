<template>
  <div class="running-queries-page" v-if="isMetaOrg">
    <q-table
      data-test="running-queries-table"
      ref="qTable"
      :rows="rowsQuery"
      :columns="columns"
      row-key="trace_id"
      style="width: 100%"
    >
      <template #no-data>
        <div v-if="!loadingState" class="text-center full-width full-height">
          <NoData />
        </div>
        <div v-else class="text-center full-width full-height q-mt-lg">
          <q-spinner-hourglass color="primary" size="lg" />
        </div>
      </template>
      <template #header-selection="scope">
        <q-checkbox v-model="scope.selected" size="sm" color="secondary" />
      </template>
      <template #body-selection="scope">
        <q-checkbox v-model="scope.selected" size="sm" color="secondary" />
      </template>
      <template #body-cell-actions="props">
        <q-td :props="props">
          <q-btn
            icon="list_alt"
            :title="t('queries.queryList')"
            class="q-ml-xs"
            padding="sm"
            unelevated
            size="sm"
            round
            flat
            @click="listSchema(props)"
            data-test="queryList-btn"
          />
          <q-btn
            :icon="outlinedCancel"
            :title="t('queries.cancelQuery')"
            class="q-ml-xs"
            padding="sm"
            unelevated
            size="sm"
            style="color: red"
            round
            flat
            @click="confirmDeleteAction(props)"
            data-test="cancelQuery-btn"
          />
        </q-td>
      </template>

      <template #top>
        <div class="flex justify-between items-center full-width">
          <div class="q-table__title" data-test="log-stream-title-text">
            {{ t("queries.runningQueries") }}
          </div>
          <div class="flex items-start">
            <div
              data-test="streams-search-stream-input"
              class="flex items-center"
            >
              <q-input
                v-model="filterQuery"
                borderless
                filled
                dense
                class="q-ml-auto q-mb-xs no-border search-input"
                :placeholder="t('queries.search')"
                data-test="running-queries-search-input"
              >
                <template #prepend>
                  <q-icon name="search" />
                </template>
              </q-input>
              <q-btn
                data-test="running-queries-refresh-btn"
                class="q-ml-md q-mb-xs text-bold no-border"
                padding="sm lg"
                color="secondary"
                no-caps
                icon="refresh"
                :label="t(`queries.refreshQuery`)"
                @click="refreshData"
              />
            </div>
          </div>
        </div>
        <div class="label-container">
          <label class="q-my-sm text-bold"
            >Last Data Refresh Time: {{ lastRefreshed }}</label
          >
        </div>
      </template>

      <template #bottom="scope">
        <q-table-pagination
          data-test="query-stream-table-pagination"
          :scope="scope"
          :resultTotal="resultTotal"
          :perPageOptions="perPageOptions"
          position="bottom"
          @update:changeRecordPerPage="changePagination"
          v-model="filterQuery"
        />
      </template>
    </q-table>
    <confirm-dialog
      v-model="deleteDialog.show"
      :title="deleteDialog.title"
      :message="deleteDialog.message"
      @update:ok="deleteQuery"
      @update:cancel="deleteDialog.show = false"
    />
    <q-dialog
      v-model="showListSchemaDialog"
      position="right"
      full-height
      maximized
      data-test="list-schema-dialog"
    >
      <QueryList :schemaData="schemaData" />
    </q-dialog>
  </div>
</template>

<script lang="ts">
import ConfirmDialog from "@/components/ConfirmDialog.vue";
import useIsMetaOrg from "@/composables/useIsMetaOrg";
import SearchService from "@/services/search";
import {
  onBeforeMount,
  ref,
  type Ref,
  defineComponent,
  computed,
  toRaw,
  watch,
} from "vue";
import { useQuasar, type QTableProps, QTable } from "quasar";
import QTablePagination from "@/components/shared/grid/Pagination.vue";
import { useI18n } from "vue-i18n";
import { outlinedCancel } from "@quasar/extras/material-icons-outlined";
import NoData from "@/components/shared/grid/NoData.vue";
import { useStore } from "vuex";
import QueryList from "@/components/queries/QueryList.vue";

export default defineComponent({
  name: "RunningQueriesList",
  components: { QueryList, ConfirmDialog, QTablePagination, NoData },
  setup() {
    const store = useStore();
    const schemaData = ref({});
    const lastRefreshed = ref("");
    const { isMetaOrg } = useIsMetaOrg();
    const resultTotal = ref<number>(0);

    const refreshData = () => {
      getRunningQueries();
      lastRefreshed.value = getCurrentTime();
    };

    // Function to get current time in a desired format
    const getCurrentTime = () => {
      const now = new Date();
      const year = now.getFullYear().toString().padStart(4, "0");
      const month = (now.getMonth() + 1).toString().padStart(2, "0");
      const day = now.getDate().toString().padStart(2, "0");
      const hours = now.getHours().toString().padStart(2, "0");
      const minutes = now.getMinutes().toString().padStart(2, "0");
      const seconds = now.getSeconds().toString().padStart(2, "0");
      const timezone = store.state.timezone;

      return `${year}-${month}-${day} ${hours}:${minutes}:${seconds} ${timezone}`;
    };

    const loadingState = ref(false);
    const queries = ref([]);

    const deleteDialog = ref({
      show: false,
      title: "Delete Running Query",
      message: "Are you sure you want to delete this running query?",
      data: null as any,
    });
    
    const qTable: Ref<InstanceType<typeof QTable> | null> = ref(null);
    const { t } = useI18n();
    const showListSchemaDialog = ref(false);

    const listSchema = (props: any) => {
      //pass whole props.row to schemaData
      schemaData.value = props.row;

      showListSchemaDialog.value = true;
    };

    const perPageOptions: any = [
      { label: "5", value: 5 },
      { label: "10", value: 10 },
      { label: "20", value: 20 },
      { label: "50", value: 50 },
      { label: "100", value: 100 },
    ];
    const selectedPerPage = ref(20);
    const pagination: any = ref({
      rowsPerPage: 20,
    });
    const changePagination = (val: { label: string; value: any }) => {
      selectedPerPage.value = val.value;
      pagination.value.rowsPerPage = val.value;
      qTable.value?.setPagination(pagination.value);
    };
    const filterQuery = ref("");

    const q = useQuasar();

    const localTimeToMicroseconds = () => {
      // Create a Date object representing the current local time
      var date = new Date();

      // Get the timestamp in milliseconds
      var timestampMilliseconds = date.getTime();

      // Convert milliseconds to microseconds
      var timestampMicroseconds = timestampMilliseconds * 1000;

      return timestampMicroseconds;
    };
    const getDuration = (createdAt: number) => {
      const currentTime = localTimeToMicroseconds();

      const durationInSeconds = Math.floor((currentTime - createdAt) / 1000000);

      let formattedDuration;
      if (durationInSeconds < 0) {
        formattedDuration = "Invalid duration";
      } else if (durationInSeconds < 60) {
        formattedDuration = `${durationInSeconds}s`;
      } else if (durationInSeconds < 3600) {
        const minutes = Math.floor(durationInSeconds / 60);
        formattedDuration = `${minutes}m`;
      } else {
        const hours = Math.floor(durationInSeconds / 3600);
        formattedDuration = `${hours}h`;
      }

      return formattedDuration;
    };

    //different between start and end time to show in UI as queryRange
    const queryRange = (startTime: number, endTime: number) => {
      const queryDuration = Math.floor((endTime - startTime) / 1000000);
      let formattedDuration;
      if (queryDuration < 0) {
        formattedDuration = "Invalid duration";
      } else if (queryDuration < 60) {
        formattedDuration = `${queryDuration}s`;
      } else if (queryDuration < 3600) {
        const minutes = Math.floor(queryDuration / 60);
        formattedDuration = `${minutes}m`;
      } else {
        const hours = Math.floor(queryDuration / 3600);
        formattedDuration = `${hours}h`;
      }

      return formattedDuration;
    };

    const columns = ref<QTableProps["columns"]>([
      {
        name: "#",
        label: "#",
        field: "#",
        align: "left",
      },
      {
        name: "user_id",
        field: "user_id",
        label: t("user.email"),
        align: "left",
        sortable: true,
      },
      {
        name: "org_id",
        field: "org_id",
        label: t("organization.id"),
        align: "left",
        sortable: true,
      },
      {
        name: "duration",
        label: t("queries.duration"),
        align: "left",
        sortable: true,
        field: "duration",
      },
      {
        name: "queryRange",
        label: t("queries.queryRange"),
        align: "left",
        sortable: true,
        field: "queryRange",
      },
      {
        name: "status",
        field: "status",
        label: t("queries.status"),
        align: "left",
        sortable: true,
      },
      {
        name: "stream_type",
        field: "stream_type",
        label: t("alerts.streamType"),
        align: "left",
        sortable: true,
      },
      {
        name: "actions",
        field: "actions",
        label: t("common.actions"),
        align: "center",
      },
    ]);

    onBeforeMount(() => {
      getRunningQueries();
      lastRefreshed.value = getCurrentTime();
    });

    // Watcher to filter queries based on user_id
    const filteredQueries = ref([]);

    const filteredRows = computed(() => {
      const newVal = filterQuery.value;
      if (!newVal) {
        return queries.value;
      } else {
        return queries.value.filter((query: any) =>
          query.user_id.toLowerCase().includes(newVal.toLowerCase())
        );
      }
    });

    // Watcher to filter queries based on user_id
    watch(filterQuery, () => {
      // Update the result total based on the filtered array length
      resultTotal.value = filteredRows.value.length;
    });

    const getRunningQueries = () => {
      const dismiss = q.notify({
        message: "Fetching running queries...",
        color: "primary",
        position: "bottom",
        spinner: true,
      });
      SearchService.get_running_queries(store.state.zoConfig.meta_org,)
        .then((response: any) => {
          // resultTotal.value = response?.data?.status?.length;
          queries.value = response?.data?.status;
          resultTotal.value = queries.value.length;
        })
        .catch((error: any) => {
          q.notify({
            message:
              error.response?.data?.message ||
              "Failed to fetch running queries",
            color: "negative",
            position: "bottom",
            timeout: 2500,
          });
        })
        .finally(() => {
          dismiss();
        });
    };

    const deleteQuery = () => {
      SearchService.delete_running_query(store.state.zoConfig.meta_org, deleteDialog.value.data)
        .then(() => {
          getRunningQueries();
          deleteDialog.value.show = false;
          q.notify({
            message: "Running query deleted successfully",
            color: "positive",
            position: "bottom",
            timeout: 2500,
          });
        })
        .catch((error: any) => {
          q.notify({
            message:
              error.response?.data?.message || "Failed to delete running query",
            color: "negative",
            position: "bottom",
            timeout: 2500,
          });
        });
    };

    const confirmDeleteAction = (props: any) => {
      deleteDialog.value.data = props.row.trace_id;
      deleteDialog.value.show = true;
    };

    const rowsQuery = computed(function () {
      const rows = toRaw(filteredRows.value) ?? [];

      rows.sort((a: any, b: any) => b.created_at - a.created_at);

      return rows.map((row: any, index) => {
        return {
          "#": index < 9 ? `0${index + 1}` : index + 1,
          user_id: row?.user_id,
          org_id: row?.org_id,
          duration: getDuration(row?.created_at),
          queryRange: queryRange(row?.query?.start_time, row?.query?.end_time),
          status: row?.status,
          stream_type: row?.stream_type,
          actions: "true",
          trace_id: row?.trace_id,
          created_at: row?.created_at,
          started_at: row?.started_at,
          sql: row?.query?.sql,
          start_time: row?.query?.start_time,
          end_time: row?.query?.end_time,
          files: row?.scan_stats?.files,
          records: row?.scan_stats?.records,
          original_size: row?.scan_stats?.original_size,
          compressed_size: row?.scan_stats?.compressed_size,
        };
      });
    });
    return {
      t,
      store,
      queries,
      columns,
      getRunningQueries,
      deleteQuery,
      confirmDeleteAction,
      deleteDialog,
      perPageOptions,
      listSchema,
      showListSchemaDialog,
      filterQuery,
      changePagination,
      outlinedCancel,
      schemaData,
      loadingState,
      refreshData,
      lastRefreshed,
      isMetaOrg,
      resultTotal,
      selectedPerPage,
      qTable,
      rowsQuery,
      filteredQueries,
    };
  },
});
</script>

<style scoped>
.label-container {
  display: flex;
  width: 100%;
  justify-content: flex-end;
}
</style>

<style lang="scss">
.running-queries-page {
  .search-input {
    width: 400px;
  }
}
</style>
