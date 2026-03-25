export const agencyServicePresets = [
  {
    key: 'social-media-management',
    label: 'Sosyal Medya Yonetimi',
    description: 'Aylik icerik plani, paylasim takvimi ve topluluk yonetimi.',
    item: {
      name: 'Sosyal Medya Yonetimi (Aylik)',
      quantity: 1,
      unitPrice: 0
    }
  },
  {
    key: 'meta-ads-management',
    label: 'Meta Reklam Yonetimi',
    description: 'Kampanya kurulumu, optimizasyon ve haftalik raporlama.',
    item: {
      name: 'Meta Reklam Yonetimi',
      quantity: 1,
      unitPrice: 0
    }
  },
  {
    key: 'google-ads-management',
    label: 'Google Reklam Yonetimi',
    description: 'Arama ve performans kampanyalarinin operasyon yonetimi.',
    item: {
      name: 'Google Reklam Yonetimi',
      quantity: 1,
      unitPrice: 0
    }
  },
  {
    key: 'branding-design',
    label: 'Marka Tasarimi',
    description: 'Marka kimligi, logo ve kurumsal gorsel paket.',
    item: {
      name: 'Marka Tasarimi Paketi',
      quantity: 1,
      unitPrice: 0
    }
  },
  {
    key: 'web-design',
    label: 'Web Design',
    description: 'Arayuz tasarimi ve responsive ekran seti.',
    item: {
      name: 'Web Design Hizmeti',
      quantity: 1,
      unitPrice: 0
    }
  },
  {
    key: 'web-development',
    label: 'Web Gelistirme',
    description: 'Frontend/backend gelistirme ve yayin alma sureci.',
    item: {
      name: 'Web Gelistirme Hizmeti',
      quantity: 1,
      unitPrice: 0
    }
  },
  {
    key: 'seo-service',
    label: 'SEO Hizmeti',
    description: 'Teknik SEO, icerik optimizasyonu ve aylik rapor.',
    item: {
      name: 'SEO Hizmeti (Aylik)',
      quantity: 1,
      unitPrice: 0
    }
  },
  {
    key: 'content-production',
    label: 'Icerik Uretimi',
    description: 'Video/gorsel/metin icerik uretim paketleri.',
    item: {
      name: 'Icerik Uretimi Paketi',
      quantity: 1,
      unitPrice: 0
    }
  },
  {
    key: 'monthly-retainer',
    label: 'Aylik Retainer',
    description: 'Aylik surekli ajans operasyon bedeli.',
    item: {
      name: 'Aylik Retainer Bedeli',
      quantity: 1,
      unitPrice: 0
    }
  }
];

export const paymentPlanPresets = [
  {
    key: 'split-50-50',
    label: '%50 pesin / %50 teslimde',
    description: 'Proje baslangicinda avans, teslimde kalan bakiye.',
    dueInDays: 14,
    items: [
      {
        name: '%50 Avans (Proje baslangici)',
        quantity: 1,
        unitPrice: 0
      },
      {
        name: '%50 Bakiye (Teslim oncesi)',
        quantity: 1,
        unitPrice: 0
      }
    ]
  },
  {
    key: 'monthly-retainer-plan',
    label: 'Aylik retainer',
    description: 'Aylik tekrarlayan hizmet faturasi/plani.',
    dueInDays: 7,
    items: [
      {
        name: 'Aylik Retainer Bedeli',
        quantity: 1,
        unitPrice: 0
      }
    ]
  },
  {
    key: 'milestone-based',
    label: 'Asama bazli odeme',
    description: 'Proje fazlarina gore parcali tahsilat.',
    dueInDays: 21,
    items: [
      {
        name: 'Milestone 1 - Kesif ve Strateji',
        quantity: 1,
        unitPrice: 0
      },
      {
        name: 'Milestone 2 - Uretim ve Revize',
        quantity: 1,
        unitPrice: 0
      },
      {
        name: 'Milestone 3 - Yayin ve Teslim',
        quantity: 1,
        unitPrice: 0
      }
    ]
  }
];

function normalizeItem(item) {
  return {
    name: String(item?.name || '').trim(),
    quantity: Number(item?.quantity) || 1,
    unitPrice: Number(item?.unitPrice) || 0
  };
}

function hasMeaningfulItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return false;
  }

  return items.some((item) => {
    const name = String(item?.name || '').trim();
    const quantity = Number(item?.quantity);
    const unitPrice = Number(item?.unitPrice);

    return Boolean(name) || quantity !== 1 || unitPrice !== 0;
  });
}

export function mergePresetItems(currentItems, presetItems) {
  const normalizedPresetItems = Array.isArray(presetItems)
    ? presetItems.map((item) => normalizeItem(item)).filter((item) => item.name)
    : [];

  if (!normalizedPresetItems.length) {
    return Array.isArray(currentItems) && currentItems.length
      ? currentItems.map((item) => normalizeItem(item))
      : [{ name: '', quantity: 1, unitPrice: 0 }];
  }

  if (!hasMeaningfulItems(currentItems)) {
    return normalizedPresetItems;
  }

  return [...currentItems.map((item) => normalizeItem(item)), ...normalizedPresetItems];
}
