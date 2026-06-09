import dotenv from 'dotenv';
import { supabase } from '../config/supabase.js';

dotenv.config();

const q = (photoId, w = 900) =>
  `https://images.unsplash.com/${photoId}?w=${w}&q=85&auto=format&fit=crop`;

const categoryImg = (photoId) => {
  const url = q(photoId);
  return { image: url, category_image_url: url };
};

const categories = [
  { name: 'RINGS', ...categoryImg('photo-1617038260897-41a1f14a8ca0') },
  { name: 'NECKLACES', ...categoryImg('photo-1602751584552-8ba73aad10e1') },
  { name: 'EARRINGS', ...categoryImg('photo-1599643478518-a784e5dc4c8f') },
  { name: 'BANGLES', ...categoryImg('photo-1596944924616-7b38e7cfac36') },
  { name: 'PENDANTS', ...categoryImg('photo-1611591437281-460bfbe1220a') },
  { name: 'BRACELETS', ...categoryImg('photo-1721808085307-919cf89fe3fa') },
  { name: 'NOSE PINS', ...categoryImg('photo-1611955167811-4711904bb9f8') },
  { name: 'COINS', ...categoryImg('photo-1601121141461-9d6647bca1ed') },
  { name: 'SOLITAIRES', ...categoryImg('photo-1708222170603-12471477b1d9') },
  { name: 'MANGALSUTRAS', ...categoryImg('photo-1617038220319-276d3cfab638') },
  { name: 'GOLD COINS', ...categoryImg('photo-1631982690223-8aa4be0a2497') },
  { name: "MEN'S RINGS", ...categoryImg('photo-1605100804763-247f67b3557e') },
];

const boutiques = [
  {
    name: 'Zoya - A Tata Product',
    location: 'Bandra West, Mumbai',
    rating: 4.9,
    image: q('photo-1588444650733-d2c8a2eac3c5', 1200),
    description: 'Signature jewellery experiences with contemporary design and trusted quality.',
  },
  {
    name: 'Hazoorilal Legacy',
    location: 'Greater Kailash, Delhi',
    rating: 4.8,
    image: q('photo-1617038220319-276d3cfab638', 1200),
    description: 'Heritage polki and temple jewellery with bespoke craftsmanship.',
  },
  {
    name: 'Vogue Jewels',
    location: 'Connaught Place, Delhi',
    rating: 4.7,
    image: q('photo-1603561596112-0a132b757442', 1200),
    description: 'Contemporary luxury with curated diamonds and bespoke styling.',
  },
  {
    name: 'Heritage Gems & Jewels',
    location: 'Karol Bagh, Delhi',
    rating: 4.8,
    image: q('photo-1611591437281-460bfbe1220a', 1200),
    description: 'Curated bridal collections and signature designs.',
  },
  {
    name: 'Aurora Contemporary',
    location: 'Rajouri Garden, Delhi',
    rating: 4.9,
    image: q('photo-1596944924616-7b38e7cfac36', 1200),
    description: 'Sleek contemporary silhouettes and refined detailing.',
  },
  {
    name: 'Shyam Boutique',
    location: 'South Extension, Delhi',
    rating: 4.9,
    image: q('photo-1515562141207-7e88fb950be7', 1200),
    description: 'A heritage boutique known for bespoke bridal pieces.',
  },
];

const collections = [
  { title: 'Wedding Collection', subtitle: 'Curated For Forever', image: q('photo-1515562141207-7e88fb950be7', 1400), slug: 'wedding' },
  { title: 'The Heritage Bridal Series', subtitle: 'Curated by top designers', image: q('photo-1603561596112-0a132b757442', 1400), slug: 'heritage-bridal' },
  { title: 'Everyday Elegance', subtitle: '14k Gold essentials', image: q('photo-1617038260897-41a1f14a8ca0', 1400), slug: 'everyday' },
];

const occasions = [
  { title: 'Wedding', subtitle: 'THE BRIDAL EDIT', image: q('photo-1617038220319-276d3cfab638', 1000), collection_slug: 'wedding' },
  { title: 'Anniversary', subtitle: 'TIMELESS CLASSICS', image: q('photo-1605100804763-247f67b3557e', 1000), collection_slug: 'anniversary' },
  { title: 'Engagement', subtitle: 'FOREVER STARTS HERE', image: q('photo-1599643478518-a784e5dc4c8f', 1000), collection_slug: 'engagement' },
  { title: 'Festive', subtitle: 'CELEBRATION COLLECTION', image: q('photo-1611652022419-a9419f74343d', 1000), collection_slug: 'festive' },
  { title: 'Daily Wear', subtitle: 'EVERYDAY ELEGANCE', image: q('photo-1596944924616-7b38e7cfac36', 1000), collection_slug: 'everyday' },
  { title: 'Birthday', subtitle: 'GIFT-WORTHY GOLD', image: q('photo-1602751584552-8ba73aad10e1', 1000), collection_slug: 'birthday' },
];

const audiences = [
  { title: 'Women', icon: 'female' },
  { title: 'Men', icon: 'male' },
  { title: 'Kids', icon: 'child-care' },
];

const offers = [
  {
    title: 'Flat 20% Off Making Charges',
    subtitle: 'On bridal collections this week',
    badge: 'LIMITED',
    image: q('photo-1515562141207-7e88fb950be7', 1200),
  },
  {
    title: 'Gold Rate Protection',
    subtitle: "Book now at today's rate",
    badge: 'POPULAR',
    image: q('photo-1617038260897-41a1f14a8ca0', 1200),
  },
  {
    title: 'Complimentary Styling Session',
    subtitle: 'For first boutique visit',
    badge: 'NEW',
    image: q('photo-1599643478518-a784e5dc4c8f', 1200),
  },
];

const giftCollections = [
  { title: 'Gifts for Her', image: q('photo-1602751584552-8ba73aad10e1', 1200) },
  { title: 'Gifts for Him', image: q('photo-1617038220319-276d3cfab638', 1200) },
  { title: 'Birthday Specials', image: q('photo-1605100804763-247f67b3557e', 1200) },
];

const goldPlans = [
  {
    name: 'Gold Mine Plan',
    description: 'Save monthly and get one bonus installment from us.',
    duration: '10+1 months',
    icon: 'savings',
  },
  {
    name: 'Gold Reserve Plan',
    description: 'Flexible monthly contributions with lock-in benefit.',
    duration: '12 months',
    icon: 'shield',
  },
  {
    name: 'Smart Sip Gold',
    description: 'Small-ticket monthly gold savings for first-time buyers.',
    duration: '6 months',
    icon: 'star',
  },
];

const productSeed = [
  { name: 'Heritage Solitaire Ring', category: 'RINGS', price: 125000, isTrending: false },
  { name: 'Temple Gold Band', category: 'RINGS', price: 48000, isTrending: false },
  { name: 'Contemporary Stack Ring', category: 'RINGS', price: 22000, isTrending: false },
  { name: 'Custom Design Signet', category: 'RINGS', price: 350000, isTrending: false },
  { name: 'Pearl Drop Necklace', category: 'NECKLACES', price: 89000, isTrending: false },
  { name: 'Layered Chain', category: 'NECKLACES', price: 45000, isTrending: false },
  { name: 'Choker Heritage', category: 'NECKLACES', price: 210000, isTrending: false },
  { name: 'Minimal Bar Pendant', category: 'NECKLACES', price: 18000, isTrending: false },
  { name: 'Chandelier Earrings', category: 'EARRINGS', price: 156000, isTrending: false },
  { name: 'Stud Classics', category: 'EARRINGS', price: 12000, isTrending: false },
  { name: 'Temple Jhumkas', category: 'EARRINGS', price: 67000, isTrending: false },
  { name: 'Hoops Silver', category: 'EARRINGS', price: 8000, isTrending: false },
  { name: 'Kada Set', category: 'BANGLES', price: 98000, isTrending: false },
  { name: 'Slim Bangles', category: 'BANGLES', price: 34000, isTrending: false },
  { name: 'Antique Cuff', category: 'BANGLES', price: 189000, isTrending: false },
  { name: 'Platinum Band', category: 'RINGS', price: 420000, isTrending: false },
  { name: 'Silver Anklet', category: 'BRACELETS', price: 9500, isTrending: false },
  { name: 'Diamond Tennis', category: 'NECKLACES', price: 510000, isTrending: false },
  { name: 'Mangalsutra Lite', category: 'NECKLACES', price: 78000, isTrending: false },
  { name: 'Kids Charm Ring', category: 'RINGS', price: 6500, isTrending: false },
  { name: 'Office Pendant', category: 'PENDANTS', price: 28000, isTrending: false },
  { name: 'Bridal Set Full', category: 'RINGS', price: 890000, isTrending: false },
  { name: 'Oxidised Earrings', category: 'EARRINGS', price: 4500, isTrending: false },
  { name: 'Rose Gold Chain', category: 'NECKLACES', price: 56000, isTrending: false },
  { name: 'Ethereal Halo Diamond Ring', category: 'RINGS', price: 145000, isTrending: true },
  { name: 'Verdant Emerald Drop Necklace', category: 'NECKLACES', price: 82500, isTrending: true },
  { name: 'Celestial Diamond Chandeliers', category: 'EARRINGS', price: 420000, isTrending: true },
  { name: 'Heritage Gold Link Bracelet', category: 'BRACELETS', price: 68900, isTrending: true },
];

function productImageByCategory(category) {
  const byCategory = {
    RINGS: q('photo-1617038260897-41a1f14a8ca0'),
    NECKLACES: q('photo-1602751584552-8ba73aad10e1'),
    EARRINGS: q('photo-1599643478518-a784e5dc4c8f'),
    BANGLES: q('photo-1620336655055-b57986f6e9e2'),
    PENDANTS: q('photo-1611591437281-460bfbe1220a'),
    BRACELETS: q('photo-1605100804763-247f67b3557e'),
  };
  return byCategory[category] ?? q('photo-1605100804763-247f67b3557e');
}

async function isEmpty(table) {
  const { count, error } = await supabase
    .from(table)
    .select('*', { head: true, count: 'exact' });
  if (error) throw new Error(`Failed to check ${table}: ${error.message}`);
  return (count ?? 0) === 0;
}

export async function seedDatabase() {
  const categoriesEmpty = await isEmpty('categories');
  if (categoriesEmpty) {
    const { error } = await supabase.from('categories').insert(categories);
    if (error) throw new Error(`Failed to seed categories: ${error.message}`);
    console.log(`[seed] Inserted ${categories.length} categories`);
  } else {
    console.log('[seed] Skipped categories, table is not empty');
  }

  const boutiquesEmpty = await isEmpty('boutiques');
  if (boutiquesEmpty) {
    const { error } = await supabase.from('boutiques').insert(boutiques);
    if (error) throw new Error(`Failed to seed boutiques: ${error.message}`);
    console.log(`[seed] Inserted ${boutiques.length} boutiques`);
  } else {
    console.log('[seed] Skipped boutiques, table is not empty');
  }

  const { data: categoryRows, error: categoryFetchError } = await supabase
    .from('categories')
    .select('id, name');
  if (categoryFetchError) {
    throw new Error(`Failed to fetch categories for products: ${categoryFetchError.message}`);
  }

  const { data: boutiqueRows, error: boutiqueFetchError } = await supabase
    .from('boutiques')
    .select('id');
  if (boutiqueFetchError) {
    throw new Error(`Failed to fetch boutiques for products: ${boutiqueFetchError.message}`);
  }
  if (!boutiqueRows?.length) {
    throw new Error('Cannot seed products without boutiques');
  }

  const categoryIdByName = new Map(
    (categoryRows ?? []).map((row) => [row.name.toUpperCase(), row.id]),
  );

  const productsEmpty = await isEmpty('products');
  if (productsEmpty) {
    const products = productSeed.map((item, index) => ({
      featured_image: productImageByCategory(item.category),
      thumbnail: productImageByCategory(item.category),
      images: [
        `${productImageByCategory(item.category)}&seed=${index}-0`,
        `${productImageByCategory(item.category)}&seed=${index}-1`,
        `${productImageByCategory(item.category)}&seed=${index}-2`,
      ],
      videos: [],
      media: [
        { type: 'image', url: `${productImageByCategory(item.category)}&seed=${index}-0` },
        { type: 'image', url: `${productImageByCategory(item.category)}&seed=${index}-1` },
        { type: 'image', url: `${productImageByCategory(item.category)}&seed=${index}-2` },
      ],
      name: item.name,
      price: item.price,
      image: productImageByCategory(item.category),
      category_id: categoryIdByName.get(item.category.toUpperCase()) ?? null,
      boutique_id: boutiqueRows[index % boutiqueRows.length].id,
      description: `Handcrafted ${item.category.toLowerCase()} jewellery with modern elegance.`,
      rating: 4.4 + (index % 5) * 0.1,
      is_trending: Boolean(item.isTrending),
    }));

    const { error } = await supabase.from('products').insert(products);
    if (error) throw new Error(`Failed to seed products: ${error.message}`);
    console.log(`[seed] Inserted ${products.length} products`);
  } else {
    console.log('[seed] Skipped base products, table is not empty');
  }

  const collectionsEmpty = await isEmpty('collections');
  if (collectionsEmpty) {
    const { error } = await supabase.from('collections').insert(collections);
    if (error) throw new Error(`Failed to seed collections: ${error.message}`);
    console.log(`[seed] Inserted ${collections.length} collections`);
  } else {
    console.log('[seed] Skipped collections, table is not empty');
  }

  const occasionsEmpty = await isEmpty('occasions');
  if (occasionsEmpty) {
    const { error } = await supabase.from('occasions').insert(occasions);
    if (error) throw new Error(`Failed to seed occasions: ${error.message}`);
    console.log(`[seed] Inserted ${occasions.length} occasions`);
  } else {
    console.log('[seed] Skipped occasions, table is not empty');
  }

  const audiencesEmpty = await isEmpty('audiences');
  if (audiencesEmpty) {
    const { error } = await supabase.from('audiences').insert(audiences);
    if (error) throw new Error(`Failed to seed audiences: ${error.message}`);
    console.log(`[seed] Inserted ${audiences.length} audiences`);
  } else {
    console.log('[seed] Skipped audiences, table is not empty');
  }

  const offersEmpty = await isEmpty('offers');
  if (offersEmpty) {
    const { error } = await supabase.from('offers').insert(offers);
    if (error) throw new Error(`Failed to seed offers: ${error.message}`);
    console.log(`[seed] Inserted ${offers.length} offers`);
  } else {
    console.log('[seed] Skipped offers, table is not empty');
  }

  const giftCollectionsEmpty = await isEmpty('gift_collections');
  if (giftCollectionsEmpty) {
    const { error } = await supabase.from('gift_collections').insert(giftCollections);
    if (error) throw new Error(`Failed to seed gift collections: ${error.message}`);
    console.log(`[seed] Inserted ${giftCollections.length} gift collections`);
  } else {
    console.log('[seed] Skipped gift collections, table is not empty');
  }

  const goldPlansEmpty = await isEmpty('gold_plans');
  if (goldPlansEmpty) {
    const { error } = await supabase.from('gold_plans').insert(goldPlans);
    if (error) throw new Error(`Failed to seed gold plans: ${error.message}`);
    console.log(`[seed] Inserted ${goldPlans.length} gold plans`);
  } else {
    console.log('[seed] Skipped gold plans, table is not empty');
  }

  const { count: trendingCount, error: trendingCountError } = await supabase
    .from('products')
    .select('*', { head: true, count: 'exact' })
    .eq('is_trending', true);
  if (trendingCountError) {
    throw new Error(`Failed to check trending products: ${trendingCountError.message}`);
  }

  if ((trendingCount ?? 0) === 0) {
    const trendingRows = [
      { name: 'Ethereal Halo Diamond Ring', price: 145000, category: 'RINGS', image: 'https://images.unsplash.com/photo-1605100804763-247f67b3557e' },
      { name: 'Verdant Emerald Drop Necklace', price: 82500, category: 'NECKLACES', image: 'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f' },
      { name: 'Celestial Diamond Chandeliers', price: 420000, category: 'EARRINGS', image: 'https://images.unsplash.com/photo-1617038220319-276d3cfab638' },
      { name: 'Heritage Gold Link Bracelet', price: 68900, category: 'BRACELETS', image: 'https://images.unsplash.com/photo-1588444837495-c6cfeb53c9c0' },
    ].map((item, index) => ({
      featured_image: item.image,
      thumbnail: item.image,
      images: [
        `${item.image}&seed=trend-${index}-0`,
        `${item.image}&seed=trend-${index}-1`,
        `${item.image}&seed=trend-${index}-2`,
      ],
      videos: [],
      media: [
        { type: 'image', url: `${item.image}&seed=trend-${index}-0` },
        { type: 'image', url: `${item.image}&seed=trend-${index}-1` },
        { type: 'image', url: `${item.image}&seed=trend-${index}-2` },
      ],
      name: item.name,
      price: item.price,
      image: item.image,
      category_id: categoryIdByName.get(item.category) ?? null,
      boutique_id: boutiqueRows[index % boutiqueRows.length].id,
      is_trending: true,
    }));

    const { error: trendingInsertError } = await supabase.from('products').insert(trendingRows);
    if (trendingInsertError) {
      throw new Error(`Failed to insert trending products: ${trendingInsertError.message}`);
    }
    console.log(`[seed] Inserted ${trendingRows.length} trending products`);
  } else {
    console.log('[seed] Skipped trending products, already present');
  }

  const productImagesEmpty = await isEmpty('product_images');
  if (productImagesEmpty) {
    const { data: allProducts, error: allProductsError } = await supabase
      .from('products')
      .select('id, category_id, categories(name)');
    if (allProductsError) {
      throw new Error(`Failed to fetch products for product_images: ${allProductsError.message}`);
    }

    const gallery = (allProducts ?? []).flatMap((row, idx) => {
      const category = row.categories?.name ?? 'RINGS';
      return [0, 1, 2].map((offset) => ({
        product_id: row.id,
        image_url: productImageByCategory(category) + `&seed=${idx + offset}`,
      }));
    });

    if (gallery.length > 0) {
      const { error: productImagesError } = await supabase.from('product_images').insert(gallery);
      if (productImagesError) {
        throw new Error(`Failed to seed product_images: ${productImagesError.message}`);
      }
      console.log(`[seed] Inserted ${gallery.length} product_images`);
    }
  } else {
    console.log('[seed] Skipped product_images, table is not empty');
  }

  const { data: productsForMedia, error: productsForMediaError } = await supabase
    .from('products')
    .select('id, image, featured_image, thumbnail, images, videos, media, product_images(image_url)');
  if (productsForMediaError) {
    throw new Error(`Failed to fetch products for media backfill: ${productsForMediaError.message}`);
  }

  for (const row of productsForMedia ?? []) {
    const relationImages = (row.product_images ?? []).map((item) => item?.image_url).filter(Boolean);
    const featuredImage = row.featured_image ?? row.image ?? relationImages[0] ?? null;
    const images = Array.isArray(row.images) && row.images.length
      ? row.images
      : relationImages.length
        ? relationImages
        : featuredImage
          ? [featuredImage]
          : [];
    const videos = Array.isArray(row.videos) ? row.videos : [];
    const media = Array.isArray(row.media) && row.media.length
      ? row.media
      : [
          ...images.map((url) => ({ type: 'image', url })),
          ...videos.map((url) => ({ type: 'video', url })),
        ];

    const { error: updateError } = await supabase
      .from('products')
      .update({
        featured_image: featuredImage,
        thumbnail: row.thumbnail ?? images[0] ?? featuredImage,
        images,
        videos,
        media,
      })
      .eq('id', row.id);
    if (updateError) {
      throw new Error(`Failed to backfill media for product ${row.id}: ${updateError.message}`);
    }
  }
  console.log('[seed] Product media fields backfilled');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seedDatabase()
    .then(() => {
      console.log('[seed] Completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('[seed] Failed:', error.message);
      process.exit(1);
    });
}
