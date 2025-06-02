// api/test.js (수정된 DetailCommon 테스트)

// ===== DetailCommon 수정된 버전 =====
async function testDetailCommon(apiKey, contentId) {
    console.log(`🔍 DetailCommon 수정된 테스트: ID=${contentId}`);
    
    // 여러 contentTypeId 시도
    const contentTypeTests = [
        { name: 'contentTypeId_없음', params: { contentTypeId: undefined } },
        { name: 'contentTypeId_32', params: { contentTypeId: '32' } },
        { name: 'contentTypeId_12', params: { contentTypeId: '12' } },
        { name: 'contentTypeId_14', params: { contentTypeId: '14' } }
    ];

    for (const test of contentTypeTests) {
        console.log(`\n🧪 [${test.name}] 시도 중...`);
        
        const params = new URLSearchParams({
            serviceKey: apiKey,
            MobileOS: 'ETC',
            MobileApp: 'HealingK',
            _type: 'json',
            contentId: contentId,
            defaultYN: 'Y',
            overviewYN: 'Y'
        });
        
        // contentTypeId가 있을 때만 추가
        if (test.params.contentTypeId) {
            params.append('contentTypeId', test.params.contentTypeId);
        }

        try {
            const url = `https://apis.data.go.kr/B551011/KorService2/detailCommon2?${params.toString()}`;
            console.log(`📡 [${test.name}] URL: ${url.substring(0, 120)}...`);
            
            const response = await fetch(url, { timeout: 8000 });
            console.log(`📊 [${test.name}] 응답: ${response.status}`);
            
            if (!response.ok) {
                console.log(`❌ [${test.name}] HTTP 오류: ${response.status}`);
                continue;
            }

            const responseText = await response.text();
            console.log(`📝 [${test.name}] 응답 길이: ${responseText.length}자`);
            
            let data;
            try {
                data = JSON.parse(responseText);
            } catch (parseError) {
                console.log(`❌ [${test.name}] JSON 파싱 실패`);
                continue;
            }
            
            // 새로운 응답 구조 확인
            const resultCode = data.resultCode || data.response?.header?.resultCode;
            const resultMsg = data.resultMsg || data.response?.header?.resultMsg;
            
            console.log(`📊 [${test.name}] 결과: ${resultCode} - ${resultMsg}`);
            
            if (resultCode === '0' || resultCode === '0000') {
                // 성공! 데이터 구조 확인
                console.log(`🎉 [${test.name}] 성공!`);
                console.log(`📋 응답 구조:`, Object.keys(data));
                
                // 데이터 위치 찾기
                let item = null;
                if (data.response?.body?.items?.item) {
                    item = data.response.body.items.item;
                } else if (data.items?.item) {
                    item = data.items.item;
                } else if (data.item) {
                    item = data.item;
                }
                
                if (item) {
                    const itemData = Array.isArray(item) ? item[0] : item;
                    console.log(`📋 Item 키들: ${Object.keys(itemData).join(', ')}`);
                    
                    return {
                        success: true,
                        method: test.name,
                        sampleData: {
                            overview: itemData.overview?.substring(0, 100) || null,
                            tel: itemData.tel || null,
                            homepage: itemData.homepage || null,
                            usetime: itemData.usetime || null,
                            parking: itemData.parking || null
                        },
                        fullData: itemData
                    };
                } else {
                    console.log(`⚠️ [${test.name}] 성공했지만 Item 없음`);
                }
            } else {
                console.log(`❌ [${test.name}] API 오류: ${resultCode} - ${resultMsg}`);
            }
            
        } catch (error) {
            console.log(`❌ [${test.name}] 요청 실패: ${error.message}`);
        }
    }
    
    return {
        success: false,
        error: '모든 contentTypeId 시도 실패',
        step: 'all_contenttype_failed'
    };
}

// ... (나머지 함수들은 동일)
